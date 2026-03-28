'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { buildDraftFromRejectedApplication } from '@/features/application/lib/application-draft';
import { splitApplicationFormData } from '@/features/application/lib/field-ownership';
import { findKenyaLocationSelection } from '@/features/application/lib/kenya-locations';
import { applicationReviewFieldOptions } from '@/features/application/lib/review-fields';
import { applicationReviewSections } from '@/features/application/lib/review-sections';
import { getApplicationPortalReadiness } from '@/features/application/queries/settings';
import { applicationSchema } from '@/features/application/schemas/application';
import { editableApplicantProfileSchema } from '@/features/application/schemas/profile';
import { manualPaymentRecordSchema } from '@/features/application/schemas/payment-record';
import {
  notifyAdminsOfSubmittedApplication,
  notifyApplicantOfApprovedApplication,
  notifyApplicantOfRejectedApplication,
  notifyApplicantOfSubmittedApplication,
} from '@/features/application/utils/application-email';
import { upsertBundledApplicationLedgerRecords, upsertPaymentLedgerRecord } from '@/features/payments/lib/ledger';
import { buildPaymentSummary } from '@/features/payments/lib/payment-config';
import { getVerifiedApplicantPaymentIntent } from '@/features/payments/queries/daraja';
import { uploadFileToCloudinary } from '@/lib/cloudinary';
import { db } from '@/lib/db';
import { Prisma, type MembershipApplication } from '@/prisma/src/generated/prisma/client';

type ApplicationActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

type DraftSaveResult = {
  error?: string;
  savedAt?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  step?: number;
};

const allowedProofTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const applicationDraftStepCount = 4;
const maxProofBytes = 5 * 1024 * 1024;
const multiValueFields = new Set(['areasOfExpertise', 'areasOfInterest']);
const trueLikeValues = new Set(['on', 'true', 'yes']);
const allowedFlaggedSections: ReadonlySet<string> = new Set(applicationReviewSections.map((section) => section.id));
const allowedFlaggedFields: ReadonlySet<string> = new Set(applicationReviewFieldOptions.map((field) => field.id));

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

function toDraftStepIndex(value: FormDataEntryValue | null, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(0, Math.min(applicationDraftStepCount - 1, parsed));
}

async function validateDraftStep(
  userId: string,
  step: number,
  values: Record<string, unknown>,
  paymentSummary: ReturnType<typeof buildPaymentSummary>,
): Promise<Record<string, string[] | undefined> | null> {
  if (step === 0) {
    const membershipType = typeof values.membershipType === 'string' ? values.membershipType.trim() : '';
    const membershipCategoryId = typeof values.membershipCategoryId === 'string' ? values.membershipCategoryId.trim() : '';
    const fieldErrors: Record<string, string[] | undefined> = {};

    if (!membershipType) {
      fieldErrors.membershipType = ['Select a membership type.'];
    }

    if (!membershipCategoryId) {
      fieldErrors.membershipCategoryId = ['Select a membership category.'];
    } else {
      const category = await db.membershipCategory.findFirst({
        where: { id: membershipCategoryId, isActive: true },
        select: { id: true },
      });

      if (!category) {
        fieldErrors.membershipCategoryId = ['Select an active membership category.'];
      }
    }

    return Object.keys(fieldErrors).length > 0 ? fieldErrors : null;
  }

  if (step === 1) {
    if (paymentSummary.collectionMode === 'MANUAL_PROOF') {
      const paymentMethod = typeof values.paymentMethod === 'string' ? values.paymentMethod.trim() : '';
      const transactionReferenceNumber = typeof values.transactionReferenceNumber === 'string' ? values.transactionReferenceNumber.trim() : '';
      const fieldErrors: Record<string, string[] | undefined> = {};

      if (!paymentMethod) {
        fieldErrors.paymentMethod = ['Select a payment method.'];
      }

      if (!transactionReferenceNumber) {
        fieldErrors.transactionReferenceNumber = ['Enter the transaction reference.'];
      }

      return Object.keys(fieldErrors).length > 0 ? fieldErrors : null;
    }

    const payerPhoneNumber = typeof values.payerPhoneNumber === 'string' ? values.payerPhoneNumber.trim() : '';
    const fieldErrors: Record<string, string[] | undefined> = {};

    if (!payerPhoneNumber) {
      fieldErrors.payerPhoneNumber = ['Enter the Safaricom number for the STK prompt.'];
    }

    const verifiedPaymentIntent = await getVerifiedApplicantPaymentIntent(userId, paymentSummary.totalAmount);
    if (!verifiedPaymentIntent) {
      fieldErrors.payerPhoneNumber = ['Complete and verify the M-Pesa payment before continuing.'];
    }

    return Object.keys(fieldErrors).length > 0 ? fieldErrors : null;
  }

  if (step === 2) {
    const digitalSignature = typeof values.digitalSignature === 'string' ? values.digitalSignature.trim() : '';
    const declarationDate = typeof values.declarationDate === 'string' ? values.declarationDate.trim() : '';
    const fieldErrors: Record<string, string[] | undefined> = {};

    if (!digitalSignature) {
      fieldErrors.digitalSignature = ['Enter your full legal name.'];
    }

    if (!declarationDate) {
      fieldErrors.declarationDate = ['Choose the declaration date.'];
    }

    if (values.declarationConfirmed !== true) {
      fieldErrors.declarationConfirmed = ['Confirm the application details are accurate.'];
    }

    if (values.codeOfConductAccepted !== true) {
      fieldErrors.codeOfConductAccepted = ['Accept the code of conduct to continue.'];
    }

    if (values.dataProcessingConsent !== true) {
      fieldErrors.dataProcessingConsent = ['Consent to data processing to continue.'];
    }

    return Object.keys(fieldErrors).length > 0 ? fieldErrors : null;
  }

  return null;
}

function serializeDraftFormData(formData: FormData) {
  const draft: Record<string, unknown> = {};

  for (const [key, value] of formData.entries()) {
    if (value instanceof File) continue;

    if (multiValueFields.has(key)) {
      draft[key] = formData
        .getAll(key)
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean);
      continue;
    }

    const normalized = value.trim();

    if (key === 'declarationConfirmed' || key === 'codeOfConductAccepted' || key === 'dataProcessingConsent') {
      draft[key] = trueLikeValues.has(normalized.toLowerCase());
      continue;
    }

    if (key === 'willingnessToVolunteer' || key === 'isLicensed') {
      draft[key] = normalized;
      continue;
    }

    draft[key] = normalized;
  }

  return draft;
}

function toJsonRecord(value: Prisma.JsonValue | null | undefined) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isPaymentRevisionRequired(application: Pick<MembershipApplication, 'flaggedFields' | 'flaggedSections' | 'status'> | null) {
  if (!application || application.status !== 'REJECTED') return false;

  return (
    application.flaggedFields.includes('paymentProof') ||
    application.flaggedFields.includes('transactionReferenceNumber') ||
    application.flaggedSections.includes('payment-declaration')
  );
}

async function upsertApplicantProfile(userId: string, data: Prisma.InputJsonValue) {
  const existingProfile = await db.applicantProfile.findUnique({
    where: { userId },
    select: { data: true },
  });

  const mergedData = {
    ...toJsonRecord(existingProfile?.data),
    ...toJsonRecord(data as Prisma.JsonValue),
  };

  await db.applicantProfile.upsert({
    where: { userId },
    update: { data: mergedData as Prisma.InputJsonValue },
    create: { userId, data: mergedData as Prisma.InputJsonValue },
  });
}

async function ensureInitialPaymentRecord(
  tx: Prisma.TransactionClient,
  application: {
    id: string;
    createdAt: Date;
    paymentCollectionMode: 'MANUAL_PROOF' | 'MPESA_DARAJA';
    paymentMethod: 'MPESA' | 'BANK_TRANSFER' | 'CARD';
    transactionReferenceNumber: string | null;
    paymentProofUrl: string | null;
    paymentProofOriginalName: string | null;
    payerPhoneNumber: string | null;
    paymentBaseAmount: number | null;
    paymentTaxAmount: number | null;
    paymentTotalAmount: number | null;
    currency: string;
  },
  recordedById: string,
  paymentSummary: ReturnType<typeof buildPaymentSummary>,
) {
  if (!application.transactionReferenceNumber) return;

  const notes =
    application.paymentCollectionMode === 'MPESA_DARAJA'
      ? 'Recorded automatically from confirmed Daraja payment.'
      : 'Recorded automatically from the approved application payment proof.';

  if (paymentSummary.includeRenewalFeeInApplication && paymentSummary.bundledRenewalFee > 0) {
    await upsertBundledApplicationLedgerRecords(tx, {
      applicationId: application.id,
      billingYear: application.createdAt.getFullYear(),
      collectionMode: application.paymentCollectionMode,
      paymentMethod: application.paymentMethod,
      transactionReferenceNumber: application.transactionReferenceNumber,
      externalReference: application.paymentCollectionMode === 'MPESA_DARAJA' ? application.transactionReferenceNumber : null,
      payerPhoneNumber: application.payerPhoneNumber,
      currency: application.currency,
      status: 'VERIFIED',
      verificationStatus: 'VERIFIED',
      proofUrl: application.paymentProofUrl,
      proofOriginalName: application.paymentProofOriginalName,
      paidAt: application.createdAt,
      recordedById,
      notes,
      applicationBaseAmount: paymentSummary.applicationFee,
      applicationTaxAmount: paymentSummary.applicationTaxAmount,
      renewalBaseAmount: paymentSummary.bundledRenewalFee,
      renewalTaxAmount: paymentSummary.renewalTaxAmount,
      applicationDescription: 'Initial application payment',
      renewalDescription: `Initial renewal payment - ${application.createdAt.getFullYear()}`,
    });
    return;
  }

  await upsertPaymentLedgerRecord(tx, {
    applicationId: application.id,
    purpose: 'APPLICATION_FEE',
    billingYear: null,
    collectionMode: application.paymentCollectionMode,
    paymentMethod: application.paymentMethod,
    transactionReferenceNumber: application.transactionReferenceNumber,
    externalReference: application.paymentCollectionMode === 'MPESA_DARAJA' ? application.transactionReferenceNumber : null,
    payerPhoneNumber: application.payerPhoneNumber,
    amount: application.paymentTotalAmount,
    baseAmount: application.paymentBaseAmount,
    taxAmount: application.paymentTaxAmount,
    totalAmount: application.paymentTotalAmount,
    currency: application.currency,
    verificationStatus: 'VERIFIED',
    description: 'Initial application payment',
    notes,
    proofUrl: application.paymentProofUrl,
    proofOriginalName: application.paymentProofOriginalName,
    status: 'VERIFIED',
    paidAt: application.createdAt,
    recordedById,
  });
}

async function generateMembershipNumber(tx: Prisma.TransactionClient) {
  const year = new Date().getFullYear();
  const shortYear = String(year).slice(-2);
  const prefix = `IGA-${shortYear}`;
  const existingCount = await tx.membershipApplication.count({
    where: { membershipNumber: { startsWith: prefix } },
  });

  let sequence = existingCount + 1;

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = `${prefix}-${String(sequence).padStart(4, '0')}`;
    const existing = await tx.membershipApplication.findFirst({
      where: { membershipNumber: candidate },
      select: { id: true },
    });

    if (!existing) return candidate;
    sequence += 1;
  }

  throw new Error('Unable to generate a unique membership number.');
}

async function persistPaymentProof(file: File) {
  if (file.size <= 0) throw new Error('Payment proof file is required');
  if (file.size > maxProofBytes) throw new Error('Payment proof file must be 5MB or smaller');
  if (!allowedProofTypes.has(file.type)) throw new Error('Payment proof must be a PDF, JPG, PNG, or WEBP file');

  const uploadedFile = await uploadFileToCloudinary(file, {
    folder: 'payment-proofs',
    publicIdPrefix: 'payment-proof',
  });

  return {
    paymentProofUrl: uploadedFile.secureUrl,
    paymentProofOriginalName: file.name,
  };
}



export async function saveApplicationDraft(formData: FormData): Promise<DraftSaveResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return { error: 'Sign in is required before draft progress can be saved.' };
  }

  const readiness = await getApplicationPortalReadiness();
  if (!readiness.isReady) {
    return { error: readiness.applicantMessage };
  }

  const existingApplication = await db.membershipApplication.findUnique({
    where: { userId: session.user.id },
    select: { status: true },
  });

  if (existingApplication?.status === 'PENDING' || existingApplication?.status === 'ACTIVE') {
    return { error: 'This application can no longer be edited.' };
  }

  const currentStep = toDraftStepIndex(formData.get('currentStep'), 0);
  const nextStep = toDraftStepIndex(formData.get('nextStep'), currentStep);
  const serializedFormData = serializeDraftFormData(formData);
  const { profileData, applicationData } = splitApplicationFormData(serializedFormData);
  const paymentSummary = buildPaymentSummary(readiness.setting);
  const existingDraft = await db.applicationDraft.findUnique({
    where: { userId: session.user.id },
    select: { data: true },
  });
  const mergedDraftData = {
    ...toJsonRecord(existingDraft?.data),
    ...applicationData,
  };

  const fieldErrors = await validateDraftStep(session.user.id, currentStep, mergedDraftData, paymentSummary);

  if (fieldErrors) {
    return {
      error: 'Please correct the highlighted fields before continuing.',
      fieldErrors,
      step: currentStep,
    };
  }

  const draft = await db.applicationDraft.upsert({
    where: { userId: session.user.id },
    update: { currentStep: nextStep, data: mergedDraftData as Prisma.InputJsonValue },
    create: { userId: session.user.id, currentStep: nextStep, data: mergedDraftData as Prisma.InputJsonValue },
  });

  await upsertApplicantProfile(session.user.id, profileData as Prisma.InputJsonValue);

  revalidatePath('/apply');
  revalidatePath('/profile');

  return { savedAt: draft.updatedAt.toISOString() };
}

export async function reviseRejectedApplication() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/auth/login?callbackUrl=%2Fdashboard');
  }

  const application = await db.membershipApplication.findUnique({ where: { userId: session.user.id } });

  if (!application || application.status !== 'REJECTED') {
    redirect('/dashboard');
  }

  const flaggedSectionStep = application.flaggedSections
    .map((sectionId) => applicationReviewSections.find((section) => section.id === sectionId)?.step)
    .find((step) => step !== undefined);

  const flaggedFieldStep = application.flaggedFields
    .map((fieldId) => applicationReviewFieldOptions.find((field) => field.id === fieldId)?.step)
    .find((step) => step !== undefined);

  await db.applicationDraft.upsert({
    where: { userId: session.user.id },
    update: {
      currentStep: flaggedSectionStep ?? flaggedFieldStep ?? 0,
      data: buildDraftFromRejectedApplication(application) as Prisma.InputJsonValue,
    },
    create: {
      userId: session.user.id,
      currentStep: flaggedSectionStep ?? flaggedFieldStep ?? 0,
      data: buildDraftFromRejectedApplication(application) as Prisma.InputJsonValue,
    },
  });

  revalidatePath('/apply');
  revalidatePath('/dashboard');
  redirect('/apply');
}

export async function submitApplication(
  _prevState: ApplicationActionState,
  formData: FormData,
): Promise<ApplicationActionState> {
  const session = await auth();

  if (!session?.user?.id || !session.user.email) {
    return { error: 'Sign in is required before you can complete your membership application.' };
  }

  const applicantEmail = session.user.email.toLowerCase();

  const readiness = await getApplicationPortalReadiness();
  if (!readiness.isReady) {
    return { error: readiness.applicantMessage };
  }

  const paymentSummary = buildPaymentSummary(readiness.setting);
  const applicationReviewMode = readiness.setting?.applicationReviewMode ?? 'MANUAL_REVIEW';
  const paymentProof = formData.get('paymentProof');
  const draftRecord = await db.applicationDraft.findUnique({
    where: { userId: session.user.id },
    select: { data: true },
  });
  const mergedApplicationData = {
    ...toJsonRecord(draftRecord?.data),
    ...splitApplicationFormData(serializeDraftFormData(formData)).applicationData,
  };

  const parsed = applicationSchema.safeParse({
    membershipType: typeof mergedApplicationData.membershipType === 'string' ? mergedApplicationData.membershipType : '',
    membershipCategoryId:
      typeof mergedApplicationData.membershipCategoryId === 'string' ? mergedApplicationData.membershipCategoryId : '',
    paymentCollectionMode:
      typeof mergedApplicationData.paymentCollectionMode === 'string'
        ? mergedApplicationData.paymentCollectionMode
        : paymentSummary.collectionMode,
    paymentMethod:
      typeof mergedApplicationData.paymentMethod === 'string'
        ? mergedApplicationData.paymentMethod
        : paymentSummary.collectionMode === 'MPESA_DARAJA'
          ? 'MPESA'
          : '',
    payerPhoneNumber:
      typeof mergedApplicationData.payerPhoneNumber === 'string'
        ? normalizeOptionalString(mergedApplicationData.payerPhoneNumber)
        : undefined,
    transactionReferenceNumber:
      typeof mergedApplicationData.transactionReferenceNumber === 'string'
        ? normalizeOptionalString(mergedApplicationData.transactionReferenceNumber)
        : undefined,
    declarationConfirmed: mergedApplicationData.declarationConfirmed === true,
    codeOfConductAccepted: mergedApplicationData.codeOfConductAccepted === true,
    dataProcessingConsent: mergedApplicationData.dataProcessingConsent === true,
    digitalSignature: typeof mergedApplicationData.digitalSignature === 'string' ? mergedApplicationData.digitalSignature : '',
    declarationDate: typeof mergedApplicationData.declarationDate === 'string' ? mergedApplicationData.declarationDate : '',
  });

  if (!parsed.success) {
    return {
      error: 'Please correct the highlighted fields and try again.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const values = parsed.data;

  if (values.paymentCollectionMode !== paymentSummary.collectionMode) {
    return { error: 'Payment settings changed. Refresh the form and try again.' };
  }

  const profileRecord = await db.applicantProfile.findUnique({
    where: { userId: session.user.id },
    select: { data: true },
  });

  const rawProfile =
    typeof profileRecord?.data === 'object' && profileRecord.data !== null
      ? (profileRecord.data as Record<string, unknown>)
      : null;

  const parsedProfile = editableApplicantProfileSchema.safeParse({
    salutation: typeof rawProfile?.salutation === 'string' ? rawProfile.salutation : '',
    firstName: typeof rawProfile?.firstName === 'string' ? rawProfile.firstName : '',
    surname: typeof rawProfile?.surname === 'string' ? rawProfile.surname : '',
    gender: typeof rawProfile?.gender === 'string' ? rawProfile.gender : '',
    ageBracket: typeof rawProfile?.ageBracket === 'string' ? rawProfile.ageBracket : '',
    idNumber: typeof rawProfile?.idNumber === 'string' ? rawProfile.idNumber : '',
    countyCode: typeof rawProfile?.countyCode === 'string' ? rawProfile.countyCode : '',
    county: typeof rawProfile?.county === 'string' ? rawProfile.county : '',
    subCountyCode: typeof rawProfile?.subCountyCode === 'string' ? rawProfile.subCountyCode : '',
    subCounty: typeof rawProfile?.subCounty === 'string' ? rawProfile.subCounty : '',
    wardCode: typeof rawProfile?.wardCode === 'string' ? rawProfile.wardCode : '',
    ward: typeof rawProfile?.ward === 'string' ? rawProfile.ward : '',
    residenceAddress: typeof rawProfile?.residenceAddress === 'string' ? rawProfile.residenceAddress : undefined,
    phoneNumber: typeof rawProfile?.phoneNumber === 'string' ? rawProfile.phoneNumber : '',
    alternativePhoneNumber: typeof rawProfile?.alternativePhoneNumber === 'string' ? rawProfile.alternativePhoneNumber : undefined,
    nextOfKinFirstName: typeof rawProfile?.nextOfKinFirstName === 'string' ? rawProfile.nextOfKinFirstName : undefined,
    nextOfKinSurname: typeof rawProfile?.nextOfKinSurname === 'string' ? rawProfile.nextOfKinSurname : undefined,
    nextOfKinRelationship: typeof rawProfile?.nextOfKinRelationship === 'string' ? rawProfile.nextOfKinRelationship : undefined,
    nextOfKinPhone: typeof rawProfile?.nextOfKinPhone === 'string' ? rawProfile.nextOfKinPhone : undefined,
    profession: typeof rawProfile?.profession === 'string' ? rawProfile.profession : undefined,
    currentJobTitle: typeof rawProfile?.currentJobTitle === 'string' ? rawProfile.currentJobTitle : undefined,
    employerOrOrganizationName: typeof rawProfile?.employerOrOrganizationName === 'string' ? rawProfile.employerOrOrganizationName : undefined,
    workAddressOrLocation: typeof rawProfile?.workAddressOrLocation === 'string' ? rawProfile.workAddressOrLocation : undefined,
    yearsOfExperience: typeof rawProfile?.yearsOfExperience === 'string' ? rawProfile.yearsOfExperience : undefined,
    areasOfExpertise: Array.isArray(rawProfile?.areasOfExpertise)
      ? rawProfile.areasOfExpertise.filter((item): item is string => typeof item === 'string')
      : [],
    highestLevelOfEducation: typeof rawProfile?.highestLevelOfEducation === 'string' ? rawProfile.highestLevelOfEducation : undefined,
    institutionForHighestDegree: typeof rawProfile?.institutionForHighestDegree === 'string' ? rawProfile.institutionForHighestDegree : undefined,
    yearOfGraduationForHighestDegree: typeof rawProfile?.yearOfGraduationForHighestDegree === 'string' ? rawProfile.yearOfGraduationForHighestDegree : undefined,
    isLicensed: rawProfile?.isLicensed === true,
    regulatoryBody: typeof rawProfile?.regulatoryBody === 'string' ? rawProfile.regulatoryBody : undefined,
    yearOfRegistration: typeof rawProfile?.yearOfRegistration === 'string' ? rawProfile.yearOfRegistration : undefined,
    preferredChapterOrRegion: typeof rawProfile?.preferredChapterOrRegion === 'string' ? rawProfile.preferredChapterOrRegion : undefined,
    refereeOneName: typeof rawProfile?.refereeOneName === 'string' ? rawProfile.refereeOneName : undefined,
    refereeOnePhone: typeof rawProfile?.refereeOnePhone === 'string' ? rawProfile.refereeOnePhone : undefined,
    refereeOneEmail: typeof rawProfile?.refereeOneEmail === 'string' ? rawProfile.refereeOneEmail : '',
    refereeOneRelationship: typeof rawProfile?.refereeOneRelationship === 'string' ? rawProfile.refereeOneRelationship : undefined,
    refereeTwoName: typeof rawProfile?.refereeTwoName === 'string' ? rawProfile.refereeTwoName : undefined,
    refereeTwoPhone: typeof rawProfile?.refereeTwoPhone === 'string' ? rawProfile.refereeTwoPhone : undefined,
    refereeTwoEmail: typeof rawProfile?.refereeTwoEmail === 'string' ? rawProfile.refereeTwoEmail : '',
    refereeTwoRelationship: typeof rawProfile?.refereeTwoRelationship === 'string' ? rawProfile.refereeTwoRelationship : undefined,
    areasOfInterest: Array.isArray(rawProfile?.areasOfInterest)
      ? rawProfile.areasOfInterest.filter((item): item is string => typeof item === 'string')
      : [],
    committeeInterest: typeof rawProfile?.committeeInterest === 'string' ? rawProfile.committeeInterest : undefined,
    referralSource: typeof rawProfile?.referralSource === 'string' ? rawProfile.referralSource : undefined,
    linkedInProfileUrl: typeof rawProfile?.linkedInProfileUrl === 'string' ? rawProfile.linkedInProfileUrl : '',
    willingnessToVolunteer:
      typeof rawProfile?.willingnessToVolunteer === 'boolean' ? rawProfile.willingnessToVolunteer : undefined,
  });

  if (!parsedProfile.success) {
    return {
      error: 'Complete and save your profile before submitting the application.',
    };
  }

  const profileValues = parsedProfile.data;
  const location = findKenyaLocationSelection(profileValues.countyCode, profileValues.subCountyCode, profileValues.wardCode);
  if (!location) {
    return {
      error: 'Please update your profile with a valid county, sub-county, and ward combination before submitting.',
    };
  }

  const membershipCategory = await db.membershipCategory.findFirst({
    where: { id: values.membershipCategoryId, isActive: true },
    select: { id: true, name: true },
  });

  if (!membershipCategory) {
    return {
      error: 'Please select an active membership category.',
      fieldErrors: { membershipCategoryId: ['Select an active membership category.'] },
    };
  }

  const existingApplication = await db.membershipApplication.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      status: true,
      paymentProofUrl: true,
      paymentProofOriginalName: true,
      flaggedFields: true,
      flaggedSections: true,
      resubmissionCount: true,
    },
  });

  if (existingApplication?.status === 'PENDING') {
    return { error: 'Your application has already been submitted and is pending review.' };
  }

  if (existingApplication?.status === 'ACTIVE') {
    return { error: 'Your membership application has already been approved.' };
  }

  const [conflictingIdNumber, conflictingEmail, conflictingPhoneNumber] = await Promise.all([
    db.membershipApplication.findFirst({
      where: { idNumber: profileValues.idNumber, NOT: existingApplication ? { userId: session.user.id } : undefined },
      select: { id: true },
    }),
    db.membershipApplication.findFirst({
      where: { email: applicantEmail, NOT: existingApplication ? { userId: session.user.id } : undefined },
      select: { id: true },
    }),
    db.membershipApplication.findFirst({
      where: { phoneNumber: profileValues.phoneNumber, NOT: existingApplication ? { userId: session.user.id } : undefined },
      select: { id: true },
    }),
  ]);

  if (conflictingIdNumber) {
    return {
      error: 'That ID number is already linked to another application.',
    };
  }

  if (conflictingEmail) {
    return {
      error: 'That email address is already linked to another application.',
    };
  }

  if (conflictingPhoneNumber) {
    return {
      error: 'That phone number is already linked to another application.',
    };
  }

  const paymentReplacementRequired = isPaymentRevisionRequired(existingApplication);
  const hasNewPaymentProof = paymentProof instanceof File && paymentProof.size > 0;

  let proof: { paymentProofUrl: string; paymentProofOriginalName: string } | null = null;
  let verifiedPaymentIntent: Awaited<ReturnType<typeof getVerifiedApplicantPaymentIntent>> | null = null;

  if (values.paymentCollectionMode === 'MANUAL_PROOF') {
    if (paymentReplacementRequired && !hasNewPaymentProof) {
      return {
        error: 'Upload a new payment proof before resubmitting this application.',
        fieldErrors: { paymentProof: ['A fresh payment proof is required for this revision.'] },
      };
    }

    if (!existingApplication && !hasNewPaymentProof) {
      return {
        error: 'Upload proof of payment before you submit this application.',
        fieldErrors: { paymentProof: ['Payment proof is required.'] },
      };
    }

    if (hasNewPaymentProof) {
      try {
        proof = await persistPaymentProof(paymentProof);
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unable to save the payment proof file.' };
      }
    }
  } else {
    verifiedPaymentIntent = await getVerifiedApplicantPaymentIntent(session.user.id, paymentSummary.totalAmount);

    if (!verifiedPaymentIntent) {
      return {
        error: 'Complete and verify the M-Pesa payment before submitting the application.',
        fieldErrors: { payerPhoneNumber: ['Start the STK push, wait for verification, then submit.'] },
      };
    }
  }

  const displayName = `${profileValues.firstName} ${profileValues.surname}`.trim();
  const isResubmission = existingApplication?.status === 'REJECTED';
  const shouldAutoApproveApplication =
    applicationReviewMode === 'AUTO_APPROVE_VERIFIED_PAYMENTS' &&
    values.paymentCollectionMode === 'MPESA_DARAJA' &&
    Boolean(verifiedPaymentIntent);
  const applicantProfileData = {
    ...rawProfile,
    salutation: profileValues.salutation,
    firstName: profileValues.firstName,
    surname: profileValues.surname,
    gender: profileValues.gender,
    ageBracket: profileValues.ageBracket,
    idNumber: profileValues.idNumber,
    countyCode: location.county.code,
    county: location.county.name,
    subCountyCode: location.subCounty.code,
    subCounty: location.subCounty.name,
    wardCode: location.ward.code,
    ward: location.ward.name,
    residenceAddress: profileValues.residenceAddress,
    phoneNumber: profileValues.phoneNumber,
    alternativePhoneNumber: profileValues.alternativePhoneNumber,
    nextOfKinFirstName: profileValues.nextOfKinFirstName,
    nextOfKinSurname: profileValues.nextOfKinSurname,
    nextOfKinRelationship: profileValues.nextOfKinRelationship,
    nextOfKinPhone: profileValues.nextOfKinPhone,
    profession: profileValues.profession,
    currentJobTitle: profileValues.currentJobTitle,
    employerOrOrganizationName: profileValues.employerOrOrganizationName,
    workAddressOrLocation: profileValues.workAddressOrLocation,
    yearsOfExperience: profileValues.yearsOfExperience,
    areasOfExpertise: profileValues.areasOfExpertise ?? [],
    highestLevelOfEducation: profileValues.highestLevelOfEducation,
    institutionForHighestDegree: profileValues.institutionForHighestDegree,
    yearOfGraduationForHighestDegree: profileValues.yearOfGraduationForHighestDegree,
    isLicensed: profileValues.isLicensed,
    regulatoryBody: profileValues.regulatoryBody,
    yearOfRegistration: profileValues.yearOfRegistration,
    preferredChapterOrRegion: profileValues.preferredChapterOrRegion,
    refereeOneName: profileValues.refereeOneName,
    refereeOnePhone: profileValues.refereeOnePhone,
    refereeOneEmail: profileValues.refereeOneEmail || null,
    refereeOneRelationship: profileValues.refereeOneRelationship,
    refereeTwoName: profileValues.refereeTwoName,
    refereeTwoPhone: profileValues.refereeTwoPhone,
    refereeTwoEmail: profileValues.refereeTwoEmail || null,
    refereeTwoRelationship: profileValues.refereeTwoRelationship,
    areasOfInterest: profileValues.areasOfInterest ?? [],
    committeeInterest: profileValues.committeeInterest,
    referralSource: profileValues.referralSource,
    linkedInProfileUrl: profileValues.linkedInProfileUrl || null,
    willingnessToVolunteer: profileValues.willingnessToVolunteer,
  } satisfies Prisma.JsonObject;

  let submittedApplicationId: string | null = null;
  let finalApplicationStatus: 'PENDING' | 'ACTIVE' = 'PENDING';
  let finalMembershipNumber: string | null = null;

  try {
    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: session.user.id },
        data: { name: displayName },
      });

      await tx.applicantProfile.upsert({
        where: { userId: session.user.id },
        update: { data: applicantProfileData },
        create: { userId: session.user.id, data: applicantProfileData },
      });

      if (existingApplication?.id && proof && existingApplication.paymentProofUrl) {
        await tx.applicationPaymentProofHistory.create({
          data: {
            applicationId: existingApplication.id,
            paymentProofUrl: existingApplication.paymentProofUrl,
            paymentProofOriginalName: existingApplication.paymentProofOriginalName ?? 'Archived proof',
          },
        });
      }

      const applicationData = {
        status: shouldAutoApproveApplication ? 'ACTIVE' as const : 'PENDING' as const,
        salutation: profileValues.salutation,
        firstName: profileValues.firstName,
        surname: profileValues.surname,
        gender: profileValues.gender,
        ageBracket: profileValues.ageBracket,
        countyCode: location.county.code,
        county: location.county.name,
        subCountyCode: location.subCounty.code,
        subCounty: location.subCounty.name,
        wardCode: location.ward.code,
        ward: location.ward.name,
        residenceAddress: profileValues.residenceAddress,
        nextOfKinFirstName: profileValues.nextOfKinFirstName,
        nextOfKinSurname: profileValues.nextOfKinSurname,
        nextOfKinRelationship: profileValues.nextOfKinRelationship,
        nextOfKinPhone: profileValues.nextOfKinPhone,
        idNumber: profileValues.idNumber,
        email: applicantEmail,
        phoneNumber: profileValues.phoneNumber,
        alternativePhoneNumber: profileValues.alternativePhoneNumber,
        profession: profileValues.profession,
        currentJobTitle: profileValues.currentJobTitle,
        employerOrOrganizationName: profileValues.employerOrOrganizationName,
        workAddressOrLocation: profileValues.workAddressOrLocation,
        yearsOfExperience: profileValues.yearsOfExperience,
        areasOfExpertise: profileValues.areasOfExpertise ?? [],
        highestLevelOfEducation: profileValues.highestLevelOfEducation,
        institutionForHighestDegree: profileValues.institutionForHighestDegree,
        yearOfGraduationForHighestDegree: profileValues.yearOfGraduationForHighestDegree,
        isLicensed: profileValues.isLicensed,
        regulatoryBody: profileValues.regulatoryBody,
        yearOfRegistration: profileValues.yearOfRegistration,
        membershipType: values.membershipType,
        membershipCategoryId: membershipCategory.id,
        membershipCategory: membershipCategory.name,
        preferredChapterOrRegion: profileValues.preferredChapterOrRegion,
        refereeOneName: profileValues.refereeOneName,
        refereeOnePhone: profileValues.refereeOnePhone,
        refereeOneEmail: profileValues.refereeOneEmail || null,
        refereeOneRelationship: profileValues.refereeOneRelationship,
        refereeTwoName: profileValues.refereeTwoName,
        refereeTwoPhone: profileValues.refereeTwoPhone,
        refereeTwoEmail: profileValues.refereeTwoEmail || null,
        refereeTwoRelationship: profileValues.refereeTwoRelationship,
        paymentCollectionMode: values.paymentCollectionMode,
        paymentMethod: values.paymentCollectionMode === 'MPESA_DARAJA' ? 'MPESA' as const : values.paymentMethod,
        payerPhoneNumber: values.paymentCollectionMode === 'MPESA_DARAJA'
          ? verifiedPaymentIntent?.payerPhoneNumber ?? values.payerPhoneNumber ?? null
          : values.payerPhoneNumber ?? null,
        paymentBaseAmount: paymentSummary.baseAmount,
        paymentTaxAmount: paymentSummary.taxAmount,
        paymentTotalAmount: paymentSummary.totalAmount,
        currency: paymentSummary.currency,
        transactionReferenceNumber: values.paymentCollectionMode === 'MPESA_DARAJA'
          ? verifiedPaymentIntent?.mpesaReceiptNumber ?? verifiedPaymentIntent?.checkoutRequestId ?? null
          : values.transactionReferenceNumber ?? null,
        paymentProofUrl: values.paymentCollectionMode === 'MANUAL_PROOF'
          ? proof?.paymentProofUrl ?? existingApplication?.paymentProofUrl ?? null
          : null,
        paymentProofOriginalName: values.paymentCollectionMode === 'MANUAL_PROOF'
          ? proof?.paymentProofOriginalName ?? existingApplication?.paymentProofOriginalName ?? null
          : null,
        declarationConfirmed: values.declarationConfirmed === true,
        codeOfConductAccepted: values.codeOfConductAccepted === true,
        dataProcessingConsent: values.dataProcessingConsent === true,
        digitalSignature: values.digitalSignature,
        declarationDate: values.declarationDate,
        areasOfInterest: profileValues.areasOfInterest ?? [],
        willingnessToVolunteer: profileValues.willingnessToVolunteer,
        committeeInterest: profileValues.committeeInterest,
        referralSource: profileValues.referralSource,
        linkedInProfileUrl: profileValues.linkedInProfileUrl || null,
        rejectionReason: null,
        reviewNotes: null,
        flaggedSections: [],
        flaggedFields: [],
        resubmissionCount: isResubmission ? (existingApplication?.resubmissionCount ?? 0) + 1 : existingApplication?.resubmissionCount ?? 0,
        resubmittedAt: isResubmission ? new Date() : existingApplication?.status === 'REJECTED' ? new Date() : null,
        reviewedAt: shouldAutoApproveApplication ? new Date() : null,
        reviewedById: null,
      };

      let nextMembershipNumber: string | null = null;
      if (shouldAutoApproveApplication) {
        nextMembershipNumber = existingApplication?.status === 'ACTIVE'
          ? null
          : await generateMembershipNumber(tx);
      }

      const applicationRecord = existingApplication
        ? await tx.membershipApplication.update({
            where: { userId: session.user.id },
            data: {
              ...applicationData,
              membershipNumber: shouldAutoApproveApplication ? nextMembershipNumber : undefined,
            },
            select: { id: true, membershipNumber: true, status: true },
          })
        : await tx.membershipApplication.create({
            data: {
              userId: session.user.id,
              ...applicationData,
              membershipNumber: shouldAutoApproveApplication ? nextMembershipNumber : null,
            },
            select: { id: true, membershipNumber: true, status: true },
          });

      submittedApplicationId = applicationRecord.id;
      finalApplicationStatus = shouldAutoApproveApplication ? 'ACTIVE' : 'PENDING';
      finalMembershipNumber = applicationRecord.membershipNumber;

      if (verifiedPaymentIntent) {
        await tx.paymentIntent.update({
          where: { id: verifiedPaymentIntent.id },
          data: { applicationId: applicationRecord.id, status: 'LOCKED', lockedAt: new Date() },
        });

        await tx.mpesaStkRequest.updateMany({
          where: { paymentIntentId: verifiedPaymentIntent.id },
          data: { applicationId: applicationRecord.id },
        });

        const paymentReference = verifiedPaymentIntent.mpesaReceiptNumber ?? verifiedPaymentIntent.checkoutRequestId ?? null;

        if (paymentReference) {
          const existingPaymentRecord = await tx.membershipPaymentRecord.findFirst({
            where: { applicationId: applicationRecord.id, transactionReferenceNumber: paymentReference },
            select: { id: true },
          });

          if (!existingPaymentRecord) {
            if (paymentSummary.includeRenewalFeeInApplication && paymentSummary.bundledRenewalFee > 0) {
              await upsertBundledApplicationLedgerRecords(tx, {
                applicationId: applicationRecord.id,
                billingYear: new Date().getFullYear(),
                paymentIntentId: verifiedPaymentIntent.id,
                collectionMode: 'MPESA_DARAJA',
                paymentMethod: 'MPESA',
                transactionReferenceNumber: paymentReference,
                externalReference: verifiedPaymentIntent.checkoutRequestId,
                payerPhoneNumber: verifiedPaymentIntent.payerPhoneNumber,
                currency: verifiedPaymentIntent.currency,
                status: 'VERIFIED',
                verificationStatus: 'VERIFIED',
                paidAt: verifiedPaymentIntent.verifiedAt ?? verifiedPaymentIntent.updatedAt,
                verifiedAt: verifiedPaymentIntent.verifiedAt ?? verifiedPaymentIntent.updatedAt,
                notes: 'Recorded automatically from a verified payment intent before submission.',
                applicationBaseAmount: paymentSummary.applicationFee,
                applicationTaxAmount: paymentSummary.applicationTaxAmount,
                renewalBaseAmount: paymentSummary.bundledRenewalFee,
                renewalTaxAmount: paymentSummary.renewalTaxAmount,
                applicationDescription: 'Application fee via M-Pesa Daraja',
                renewalDescription: `Initial renewal fee via M-Pesa Daraja - ${new Date().getFullYear()}`,
              });
            } else {
              await upsertPaymentLedgerRecord(tx, {
                applicationId: applicationRecord.id,
                purpose: 'APPLICATION_FEE',
                billingYear: null,
                paymentIntentId: verifiedPaymentIntent.id,
                collectionMode: 'MPESA_DARAJA',
                paymentMethod: 'MPESA',
                transactionReferenceNumber: paymentReference,
                externalReference: verifiedPaymentIntent.checkoutRequestId,
                payerPhoneNumber: verifiedPaymentIntent.payerPhoneNumber,
                amount: verifiedPaymentIntent.totalAmount,
                baseAmount: verifiedPaymentIntent.baseAmount,
                taxAmount: verifiedPaymentIntent.taxAmount,
                totalAmount: verifiedPaymentIntent.totalAmount,
                currency: verifiedPaymentIntent.currency,
                verificationStatus: 'VERIFIED',
                description: 'Application fee via M-Pesa Daraja',
                notes: 'Recorded automatically from a verified payment intent before submission.',
                status: 'VERIFIED',
                verifiedAt: verifiedPaymentIntent.verifiedAt ?? verifiedPaymentIntent.updatedAt,
                paidAt: verifiedPaymentIntent.verifiedAt ?? verifiedPaymentIntent.updatedAt,
              });
            }
          }
        }
      }

      await tx.applicationDraft.deleteMany({ where: { userId: session.user.id } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = Array.isArray(error.meta?.target) ? error.meta.target.join(',') : String(error.meta?.target ?? '');

      if (target.includes('idNumber')) {
        return { error: 'That ID number is already linked to another application.' };
      }

      if (target.toLowerCase().includes('email')) {
        return { error: 'That email address is already linked to another application.' };
      }

      if (target.includes('phoneNumber')) {
        return { error: 'That phone number is already linked to another application.' };
      }
    }

    throw error;
  }

  revalidatePath('/apply');
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/payments');
  revalidatePath('/profile');

  const paymentStatusLabel = values.paymentCollectionMode === 'MPESA_DARAJA'
    ? 'Verified before submission'
    : 'Payment proof uploaded and awaiting review';
  const paymentReference = values.paymentCollectionMode === 'MPESA_DARAJA'
    ? verifiedPaymentIntent?.mpesaReceiptNumber ?? verifiedPaymentIntent?.checkoutRequestId ?? null
    : values.transactionReferenceNumber ?? null;

  if (submittedApplicationId) {
    await notifyAdminsOfSubmittedApplication({
      applicationId: submittedApplicationId,
      applicantName: displayName,
      applicantEmail: applicantEmail,
      county: location.county.name,
      membershipCategory: membershipCategory.name,
      paymentCollectionMode: values.paymentCollectionMode,
      paymentStatusLabel,
      paymentReference,
      totalAmount: paymentSummary.totalAmount,
      currency: paymentSummary.currency,
      applicationStatus: finalApplicationStatus,
    });
  }

  if (shouldAutoApproveApplication) {
    await notifyApplicantOfApprovedApplication({
      email: applicantEmail,
      applicantName: displayName,
      membershipNumber: finalMembershipNumber ?? '',
    });

    return {
      success: 'Application submitted and approved automatically. Your verified payment has been locked and your member access is now active.',
    };
  }

  await notifyApplicantOfSubmittedApplication({
    email: applicantEmail,
    applicantName: displayName,
    membershipCategory: membershipCategory.name,
    paymentCollectionMode: values.paymentCollectionMode,
    paymentStatusLabel,
    paymentReference,
    totalAmount: paymentSummary.totalAmount,
    currency: paymentSummary.currency,
  });

  return {
    success:
      values.paymentCollectionMode === 'MPESA_DARAJA'
        ? 'Application submitted. Your verified M-Pesa payment has been locked to this application and it is now pending review.'
        : 'Application submitted. Your payment proof was received and is now pending review.',
  };
}

export async function approveApplication(applicationId: string) {
  const session = await auth();

  if (!session?.user || session.user.role !== 'ADMIN') {
    throw new Error('Unauthorized');
  }

  const application = await db.$transaction(async (tx) => {
    const existing = await tx.membershipApplication.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        email: true,
        firstName: true,
        surname: true,
        membershipNumber: true,
        createdAt: true,
        paymentCollectionMode: true,
        paymentMethod: true,
        transactionReferenceNumber: true,
        paymentProofUrl: true,
        paymentProofOriginalName: true,
        payerPhoneNumber: true,
        paymentBaseAmount: true,
        paymentTaxAmount: true,
        paymentTotalAmount: true,
        currency: true,
      },
    });

    if (!existing) {
      throw new Error('Application not found');
    }

    const membershipNumber = existing.membershipNumber ?? await generateMembershipNumber(tx);
    const reviewedAt = new Date();

    await ensureInitialPaymentRecord(tx, existing, session.user.id, buildPaymentSummary(await db.applicationPortalSetting.findUnique({ where: { singletonKey: 'default' } })));

    return tx.membershipApplication.update({
      where: { id: applicationId },
      data: {
        status: 'ACTIVE',
        membershipNumber,
        rejectionReason: null,
        reviewNotes: null,
        flaggedSections: [],
        flaggedFields: [],
        reviewedAt,
        reviewedById: session.user.id,
      },
      select: {
        email: true,
        firstName: true,
        surname: true,
        membershipNumber: true,
      },
    });
  });

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/payments');

  await notifyApplicantOfApprovedApplication({
    email: application.email,
    applicantName: [application.firstName, application.surname].filter(Boolean).join(' '),
    membershipNumber: application.membershipNumber ?? '',
  });
}

export async function rejectApplication(applicationId: string, formData: FormData) {
  const session = await auth();

  if (!session?.user || session.user.role !== 'ADMIN') {
    throw new Error('Unauthorized');
  }

  const reason = normalizeString(formData.get('rejectionReason'));
  const reviewNotes = normalizeOptionalString(formData.get('reviewNotes'));
  const flaggedSections = formData
    .getAll('flaggedSections')
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => allowedFlaggedSections.has(value));
  const flaggedFields = formData
    .getAll('flaggedFields')
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => allowedFlaggedFields.has(value));

  if (!reason) {
    throw new Error('Rejection reason is required');
  }

  const application = await db.membershipApplication.update({
    where: { id: applicationId },
    data: {
      status: 'REJECTED',
      rejectionReason: reason,
      reviewNotes: reviewNotes ?? null,
      flaggedSections,
      flaggedFields,
      rejectedAt: new Date(),
      reviewedAt: new Date(),
      reviewedById: session.user.id,
    },
    select: {
      email: true,
      firstName: true,
      surname: true,
    },
  });

  revalidatePath('/dashboard');

  await notifyApplicantOfRejectedApplication({
    email: application.email,
    applicantName: [application.firstName, application.surname].filter(Boolean).join(' '),
    reason,
    reviewNotes,
  });
}

export async function recordMemberPayment(
  applicationId: string,
  _prevState: ApplicationActionState,
  formData: FormData,
): Promise<ApplicationActionState> {
  const session = await auth();

  if (!session?.user || session.user.role !== 'ADMIN') {
    return { error: 'Unauthorized' };
  }

  const parsed = manualPaymentRecordSchema.safeParse({
    paymentMethod: formData.get('paymentMethod'),
    status: formData.get('status'),
    transactionReferenceNumber: formData.get('transactionReferenceNumber'),
    paidAt: formData.get('paidAt'),
    amount: formData.get('amount'),
    payerPhoneNumber: normalizeOptionalString(formData.get('payerPhoneNumber')),
    description: normalizeOptionalString(formData.get('description')),
    notes: normalizeOptionalString(formData.get('notes')),
  });

  if (!parsed.success) {
    return {
      error: 'Payment record could not be saved.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const application = await db.membershipApplication.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      status: true,
      currency: true,
    },
  });

  if (!application) {
    return { error: 'Application not found.' };
  }

  if (application.status !== 'ACTIVE') {
    return { error: 'Only active members can receive additional payment history records.' };
  }

  const existingRecord = await db.membershipPaymentRecord.findFirst({
    where: {
      applicationId,
      transactionReferenceNumber: parsed.data.transactionReferenceNumber,
    },
    select: { id: true },
  });

  if (existingRecord) {
    return {
      error: 'That transaction reference already exists for this member.',
      fieldErrors: {
        transactionReferenceNumber: ['That transaction reference already exists for this member.'],
      },
    };
  }

  const paymentProof = formData.get('paymentProof');
  const persistedProof = paymentProof instanceof File && paymentProof.size > 0 ? await persistPaymentProof(paymentProof) : null;

  await db.membershipPaymentRecord.create({
    data: {
      applicationId,
      collectionMode: 'MANUAL_PROOF',
      paymentMethod: parsed.data.paymentMethod,
      status: parsed.data.status,
      transactionReferenceNumber: parsed.data.transactionReferenceNumber,
      payerPhoneNumber: parsed.data.payerPhoneNumber || null,
      amount: parsed.data.amount,
      baseAmount: parsed.data.amount,
      taxAmount: 0,
      totalAmount: parsed.data.amount,
      currency: application.currency ?? 'KES',
      paidAt: parsed.data.paidAt,
      description: parsed.data.description || null,
      notes: parsed.data.notes || null,
      proofUrl: persistedProof?.paymentProofUrl,
      proofOriginalName: persistedProof?.paymentProofOriginalName,
      recordedById: session.user.id,
    },
  });

  revalidatePath('/dashboard');
  revalidatePath(`/dashboard/applications/${applicationId}`);
  revalidatePath('/dashboard/payments');

  return { success: 'Payment record saved.' };
}



