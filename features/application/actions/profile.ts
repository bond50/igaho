'use server';

import { revalidatePath } from 'next/cache';

import * as z from 'zod';

import { auth } from '@/auth';
import { findKenyaLocationSelection } from '@/features/application/lib/kenya-locations';
import { editableApplicantProfileSchema } from '@/features/application/schemas/profile';
import { ageBrackets, educationLevels, genders, nextOfKinRelationships, salutations, yearsOfExperienceOptions } from '@/features/application/schemas/application';
import { db } from '@/lib/db';
import { Prisma } from '@/prisma/src/generated/prisma/client';

type ProfileActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  step?: number;
  redirectTo?: string;
  values?: Record<string, unknown>;
};

const optionalString = () => z.string().trim().optional();
const optionalEmail = (label: string) => z.string().trim().email(`${label} must be valid`).optional().or(z.literal(''));
const optionalUrl = (label: string) => z.string().trim().url(`${label} must be valid`).optional().or(z.literal(''));

const profileStepSchemas = [
  z.object({
    salutation: z.enum(salutations),
    firstName: z.string().trim().min(1, 'First name is required'),
    surname: z.string().trim().min(1, 'Surname is required'),
    gender: z.enum(genders),
    ageBracket: z.enum(ageBrackets),
    idNumber: z.string().trim().min(1, 'ID number is required'),
  }),
  z.object({
    countyCode: z.string().trim().min(1, 'County is required'),
    subCountyCode: z.string().trim().min(1, 'Sub-county is required'),
    wardCode: z.string().trim().min(1, 'Ward is required'),
    residenceAddress: optionalString(),
    phoneNumber: z.string().trim().min(1, 'Phone number is required'),
    alternativePhoneNumber: optionalString(),
  }),
  z.object({
    nextOfKinFirstName: optionalString(),
    nextOfKinSurname: optionalString(),
    nextOfKinRelationship: z.enum(nextOfKinRelationships).optional(),
    nextOfKinPhone: optionalString(),
  }),
  z.object({
    profession: optionalString(),
    currentJobTitle: optionalString(),
    employerOrOrganizationName: optionalString(),
    workAddressOrLocation: optionalString(),
    yearsOfExperience: z.enum(yearsOfExperienceOptions).optional(),
    areasOfExpertise: z.array(z.string().trim().min(1)).optional(),
  }),
  z.object({
    highestLevelOfEducation: z.enum(educationLevels).optional(),
    institutionForHighestDegree: optionalString(),
    yearOfGraduationForHighestDegree: optionalString(),
    isLicensed: z.boolean(),
    regulatoryBody: optionalString(),
    yearOfRegistration: optionalString(),
  }).superRefine((data, ctx) => {
    if (data.isLicensed && !data.regulatoryBody) {
      ctx.addIssue({ code: 'custom', path: ['regulatoryBody'], message: 'Regulatory body is required when licensed' });
    }
    if (data.isLicensed && !data.yearOfRegistration) {
      ctx.addIssue({ code: 'custom', path: ['yearOfRegistration'], message: 'Year of registration is required when licensed' });
    }
  }),
  z.object({
    preferredChapterOrRegion: optionalString(),
    referralSource: optionalString(),
    linkedInProfileUrl: optionalUrl('LinkedIn / profile URL'),
    willingnessToVolunteer: z.boolean().optional(),
    areasOfInterest: z.array(z.string().trim().min(1)).optional(),
    committeeInterest: optionalString(),
  }),
  z.object({
    refereeOneName: optionalString(),
    refereeOnePhone: optionalString(),
    refereeOneEmail: optionalEmail('Referee 1 email'),
    refereeOneRelationship: optionalString(),
    refereeTwoName: optionalString(),
    refereeTwoPhone: optionalString(),
    refereeTwoEmail: optionalEmail('Referee 2 email'),
    refereeTwoRelationship: optionalString(),
  }),
] as const;

const LAST_PROFILE_STEP = profileStepSchemas.length - 1;

function normalizeBoolean(value: FormDataEntryValue | null) {
  return value === 'on' || value === 'true';
}

function normalizeString(value: FormDataEntryValue | null) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOptionalString(value: FormDataEntryValue | null) {
  const normalized = normalizeString(value);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeStringList(formData: FormData, key: string) {
  const directValues = formData
    .getAll(key)
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean);

  if (directValues.length > 0) {
    return directValues;
  }

  const textareaValue = normalizeString(formData.get(key));
  if (!textareaValue) return [];

  return textareaValue
    .split(/\r?\n|,/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function getStoredString(values: Record<string, unknown>, key: string) {
  return typeof values[key] === 'string' ? values[key] : undefined;
}

function getStoredBoolean(values: Record<string, unknown>, key: string) {
  return typeof values[key] === 'boolean' ? values[key] : undefined;
}

function getStoredStringArray(values: Record<string, unknown>, key: string) {
  const value = values[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function buildPersistedProfileData(values: Record<string, unknown>) {
  return {
    salutation: getStoredString(values, 'salutation') ?? '',
    firstName: getStoredString(values, 'firstName') ?? '',
    surname: getStoredString(values, 'surname') ?? '',
    gender: getStoredString(values, 'gender') ?? '',
    ageBracket: getStoredString(values, 'ageBracket') ?? '',
    idNumber: getStoredString(values, 'idNumber') ?? '',
    countyCode: getStoredString(values, 'countyCode') ?? '',
    county: getStoredString(values, 'county') ?? '',
    subCountyCode: getStoredString(values, 'subCountyCode') ?? '',
    subCounty: getStoredString(values, 'subCounty') ?? '',
    wardCode: getStoredString(values, 'wardCode') ?? '',
    ward: getStoredString(values, 'ward') ?? '',
    residenceAddress: getStoredString(values, 'residenceAddress'),
    phoneNumber: getStoredString(values, 'phoneNumber') ?? '',
    alternativePhoneNumber: getStoredString(values, 'alternativePhoneNumber'),
    nextOfKinFirstName: getStoredString(values, 'nextOfKinFirstName'),
    nextOfKinSurname: getStoredString(values, 'nextOfKinSurname'),
    nextOfKinRelationship: getStoredString(values, 'nextOfKinRelationship'),
    nextOfKinPhone: getStoredString(values, 'nextOfKinPhone'),
    profession: getStoredString(values, 'profession'),
    currentJobTitle: getStoredString(values, 'currentJobTitle'),
    employerOrOrganizationName: getStoredString(values, 'employerOrOrganizationName'),
    workAddressOrLocation: getStoredString(values, 'workAddressOrLocation'),
    yearsOfExperience: getStoredString(values, 'yearsOfExperience'),
    areasOfExpertise: getStoredStringArray(values, 'areasOfExpertise'),
    highestLevelOfEducation: getStoredString(values, 'highestLevelOfEducation'),
    institutionForHighestDegree: getStoredString(values, 'institutionForHighestDegree'),
    yearOfGraduationForHighestDegree: getStoredString(values, 'yearOfGraduationForHighestDegree'),
    isLicensed: getStoredBoolean(values, 'isLicensed') ?? false,
    regulatoryBody: getStoredString(values, 'regulatoryBody'),
    yearOfRegistration: getStoredString(values, 'yearOfRegistration'),
    preferredChapterOrRegion: getStoredString(values, 'preferredChapterOrRegion'),
    refereeOneName: getStoredString(values, 'refereeOneName'),
    refereeOnePhone: getStoredString(values, 'refereeOnePhone'),
    refereeOneEmail: getStoredString(values, 'refereeOneEmail') ?? '',
    refereeOneRelationship: getStoredString(values, 'refereeOneRelationship'),
    refereeTwoName: getStoredString(values, 'refereeTwoName'),
    refereeTwoPhone: getStoredString(values, 'refereeTwoPhone'),
    refereeTwoEmail: getStoredString(values, 'refereeTwoEmail') ?? '',
    refereeTwoRelationship: getStoredString(values, 'refereeTwoRelationship'),
    areasOfInterest: getStoredStringArray(values, 'areasOfInterest'),
    committeeInterest: getStoredString(values, 'committeeInterest'),
    referralSource: getStoredString(values, 'referralSource'),
    linkedInProfileUrl: getStoredString(values, 'linkedInProfileUrl') ?? '',
    willingnessToVolunteer: getStoredBoolean(values, 'willingnessToVolunteer'),
    profileCurrentStep: typeof values.profileCurrentStep === 'number' ? values.profileCurrentStep : 0,
  } satisfies Prisma.JsonObject;
}

function toRecord(value: unknown) {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function toStepIndex(value: FormDataEntryValue | null, fallback: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(0, Math.min(LAST_PROFILE_STEP, parsed));
}

function getSubmittedProfileValues(formData: FormData) {
  return {
    salutation: formData.get('salutation'),
    firstName: formData.get('firstName'),
    surname: formData.get('surname'),
    gender: formData.get('gender'),
    ageBracket: formData.get('ageBracket'),
    idNumber: formData.get('idNumber'),
    countyCode: formData.get('countyCode'),
    subCountyCode: formData.get('subCountyCode'),
    wardCode: formData.get('wardCode'),
    residenceAddress: normalizeOptionalString(formData.get('residenceAddress')),
    phoneNumber: formData.get('phoneNumber'),
    alternativePhoneNumber: normalizeOptionalString(formData.get('alternativePhoneNumber')),
    nextOfKinFirstName: normalizeOptionalString(formData.get('nextOfKinFirstName')),
    nextOfKinSurname: normalizeOptionalString(formData.get('nextOfKinSurname')),
    nextOfKinRelationship: normalizeOptionalString(formData.get('nextOfKinRelationship')),
    nextOfKinPhone: normalizeOptionalString(formData.get('nextOfKinPhone')),
    profession: normalizeOptionalString(formData.get('profession')),
    currentJobTitle: normalizeOptionalString(formData.get('currentJobTitle')),
    employerOrOrganizationName: normalizeOptionalString(formData.get('employerOrOrganizationName')),
    workAddressOrLocation: normalizeOptionalString(formData.get('workAddressOrLocation')),
    yearsOfExperience: normalizeOptionalString(formData.get('yearsOfExperience')),
    areasOfExpertise: normalizeStringList(formData, 'areasOfExpertise'),
    highestLevelOfEducation: normalizeOptionalString(formData.get('highestLevelOfEducation')),
    institutionForHighestDegree: normalizeOptionalString(formData.get('institutionForHighestDegree')),
    yearOfGraduationForHighestDegree: normalizeOptionalString(formData.get('yearOfGraduationForHighestDegree')),
    isLicensed: normalizeBoolean(formData.get('isLicensed')),
    regulatoryBody: normalizeOptionalString(formData.get('regulatoryBody')),
    yearOfRegistration: normalizeOptionalString(formData.get('yearOfRegistration')),
    preferredChapterOrRegion: normalizeOptionalString(formData.get('preferredChapterOrRegion')),
    refereeOneName: normalizeOptionalString(formData.get('refereeOneName')),
    refereeOnePhone: normalizeOptionalString(formData.get('refereeOnePhone')),
    refereeOneEmail: normalizeOptionalString(formData.get('refereeOneEmail')) ?? '',
    refereeOneRelationship: normalizeOptionalString(formData.get('refereeOneRelationship')),
    refereeTwoName: normalizeOptionalString(formData.get('refereeTwoName')),
    refereeTwoPhone: normalizeOptionalString(formData.get('refereeTwoPhone')),
    refereeTwoEmail: normalizeOptionalString(formData.get('refereeTwoEmail')) ?? '',
    refereeTwoRelationship: normalizeOptionalString(formData.get('refereeTwoRelationship')),
    areasOfInterest: normalizeStringList(formData, 'areasOfInterest'),
    committeeInterest: normalizeOptionalString(formData.get('committeeInterest')),
    referralSource: normalizeOptionalString(formData.get('referralSource')),
    linkedInProfileUrl: normalizeOptionalString(formData.get('linkedInProfileUrl')) ?? '',
    willingnessToVolunteer:
      formData.get('willingnessToVolunteer') === null
        ? undefined
        : normalizeBoolean(formData.get('willingnessToVolunteer')),
  };
}

function buildActionValues(values: ReturnType<typeof getSubmittedProfileValues>) {
  return {
    ...values,
    salutation: typeof values.salutation === 'string' ? values.salutation : '',
    firstName: typeof values.firstName === 'string' ? values.firstName : '',
    surname: typeof values.surname === 'string' ? values.surname : '',
    gender: typeof values.gender === 'string' ? values.gender : '',
    ageBracket: typeof values.ageBracket === 'string' ? values.ageBracket : '',
    idNumber: typeof values.idNumber === 'string' ? values.idNumber : '',
    countyCode: typeof values.countyCode === 'string' ? values.countyCode : '',
    subCountyCode: typeof values.subCountyCode === 'string' ? values.subCountyCode : '',
    wardCode: typeof values.wardCode === 'string' ? values.wardCode : '',
    phoneNumber: typeof values.phoneNumber === 'string' ? values.phoneNumber : '',
    county: typeof values.countyCode === 'string' ? values.countyCode : '',
    subCounty: typeof values.subCountyCode === 'string' ? values.subCountyCode : '',
    ward: typeof values.wardCode === 'string' ? values.wardCode : '',
  } satisfies Record<string, unknown>;
}

export async function updateApplicantProfile(
  _prevState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { error: 'Sign in is required before you can update your profile.' };
  }

  const currentStep = toStepIndex(formData.get('currentStepIndex'), 0);
  const nextStep = toStepIndex(formData.get('nextStepIndex'), currentStep);
  const submittedValues = getSubmittedProfileValues(formData);
  const actionValues = buildActionValues(submittedValues);
  const stepSchema = profileStepSchemas[currentStep];
  const stepParsed = stepSchema.safeParse(submittedValues);

  if (!stepParsed.success) {
    return {
      error: 'Please correct the highlighted profile fields and try again.',
      fieldErrors: stepParsed.error.flatten().fieldErrors,
      step: currentStep,
      values: actionValues,
    };
  }

  const [existingProfile, existingApplication] = await Promise.all([
    db.applicantProfile.findUnique({ where: { userId: session.user.id } }),
    db.membershipApplication.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    }),
  ]);
  const mergedProfileData = {
    ...toRecord(existingProfile?.data),
    ...stepParsed.data,
  } as Record<string, unknown>;

  if (currentStep === 1) {
    const contactStepData = stepParsed.data as z.infer<(typeof profileStepSchemas)[1]>;
    const location = findKenyaLocationSelection(contactStepData.countyCode, contactStepData.subCountyCode, contactStepData.wardCode);

    if (!location) {
      return {
        error: 'Please select a valid county, sub-county, and ward combination.',
        fieldErrors: {
          countyCode: ['Select a valid county.'],
          subCountyCode: ['Select a valid sub-county.'],
          wardCode: ['Select a valid ward.'],
        },
        step: currentStep,
        values: actionValues,
      };
    }

    mergedProfileData.countyCode = location.county.code;
    mergedProfileData.county = location.county.name;
    mergedProfileData.subCountyCode = location.subCounty.code;
    mergedProfileData.subCounty = location.subCounty.name;
    mergedProfileData.wardCode = location.ward.code;
    mergedProfileData.ward = location.ward.name;
  }

  const exclusion = existingApplication ? { userId: session.user.id } : undefined;

  if (currentStep === 0) {
    const identityStepData = stepParsed.data as z.infer<(typeof profileStepSchemas)[0]>;
    const [conflictingIdNumber, conflictingEmail] = await Promise.all([
      db.membershipApplication.findFirst({
        where: { idNumber: identityStepData.idNumber, NOT: exclusion },
        select: { id: true },
      }),
      session.user.email
        ? db.membershipApplication.findFirst({
            where: { email: session.user.email.toLowerCase(), NOT: exclusion },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);

    if (conflictingIdNumber) {
      return {
        error: 'That ID number is already linked to another application.',
        fieldErrors: { idNumber: ['That ID number is already linked to another application.'] },
        step: currentStep,
        values: actionValues,
      };
    }

    if (conflictingEmail) {
      return {
        error: 'That account email is already linked to another application.',
        step: currentStep,
        values: actionValues,
      };
    }
  }

  if (currentStep === 1) {
    const contactStepData = stepParsed.data as z.infer<(typeof profileStepSchemas)[1]>;
    const conflictingPhoneNumber = await db.membershipApplication.findFirst({
      where: { phoneNumber: contactStepData.phoneNumber, NOT: exclusion },
      select: { id: true },
    });

    if (conflictingPhoneNumber) {
      return {
        error: 'That phone number is already linked to another application.',
        fieldErrors: { phoneNumber: ['That phone number is already linked to another application.'] },
        step: currentStep,
        values: actionValues,
      };
    }
  }

  mergedProfileData.profileCurrentStep = nextStep;

  if (typeof mergedProfileData.firstName === 'string' && typeof mergedProfileData.surname === 'string') {
    await db.user.update({
      where: { id: session.user.id },
      data: { name: `${mergedProfileData.firstName} ${mergedProfileData.surname}`.trim() },
    });
  }

  const persistedProfileData = buildPersistedProfileData(mergedProfileData);

  await db.applicantProfile.upsert({
    where: { userId: session.user.id },
    update: { data: persistedProfileData },
    create: { userId: session.user.id, data: persistedProfileData },
  });

  revalidatePath('/profile');
  revalidatePath('/apply');
  revalidatePath('/dashboard');

  const { profileCurrentStep: _ignoredStep, ...completionCandidate } = persistedProfileData;
  const completionCheck = editableApplicantProfileSchema.safeParse(completionCandidate);

  return {
    success: completionCheck.success ? 'Your profile is complete.' : nextStep !== currentStep ? 'Step saved. Continue with the next section.' : 'Progress saved.',
    step: nextStep,
    redirectTo: completionCheck.success && currentStep === LAST_PROFILE_STEP ? '/apply' : undefined,
  };
}
