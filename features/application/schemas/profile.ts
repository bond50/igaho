import * as z from 'zod';

import {
  ageBrackets,
  educationLevels,
  genders,
  nextOfKinRelationships,
  salutations,
  yearsOfExperienceOptions,
} from '@/features/application/schemas/application';

const optionalString = () => z.string().trim().optional();
const optionalEmail = (label: string) => z.string().trim().email(`${label} must be valid`).optional().or(z.literal(''));

export const editableApplicantProfileSchema = z
  .object({
    salutation: z.enum(salutations),
    firstName: z.string().trim().min(1, 'First name is required'),
    surname: z.string().trim().min(1, 'Surname is required'),
    gender: z.enum(genders),
    ageBracket: z.enum(ageBrackets),
    idNumber: z.string().trim().min(1, 'ID number is required'),
    countyCode: z.string().trim().min(1, 'County is required'),
    county: z.string().trim().min(1, 'County is required'),
    subCountyCode: z.string().trim().min(1, 'Sub-county is required'),
    subCounty: z.string().trim().min(1, 'Sub-county is required'),
    wardCode: z.string().trim().min(1, 'Ward is required'),
    ward: z.string().trim().min(1, 'Ward is required'),
    residenceAddress: optionalString(),
    phoneNumber: z.string().trim().min(1, 'Phone number is required'),
    alternativePhoneNumber: optionalString(),
    nextOfKinFirstName: optionalString(),
    nextOfKinSurname: optionalString(),
    nextOfKinRelationship: z.enum(nextOfKinRelationships).optional(),
    nextOfKinPhone: optionalString(),
    profession: optionalString(),
    currentJobTitle: optionalString(),
    employerOrOrganizationName: optionalString(),
    workAddressOrLocation: optionalString(),
    yearsOfExperience: z.enum(yearsOfExperienceOptions).optional(),
    areasOfExpertise: z.array(z.string().trim().min(1)).optional(),
    highestLevelOfEducation: z.enum(educationLevels).optional(),
    institutionForHighestDegree: optionalString(),
    yearOfGraduationForHighestDegree: optionalString(),
    isLicensed: z.boolean(),
    regulatoryBody: optionalString(),
    yearOfRegistration: optionalString(),
    preferredChapterOrRegion: optionalString(),
    refereeOneName: optionalString(),
    refereeOnePhone: optionalString(),
    refereeOneEmail: optionalEmail('Referee 1 email'),
    refereeOneRelationship: optionalString(),
    refereeTwoName: optionalString(),
    refereeTwoPhone: optionalString(),
    refereeTwoEmail: optionalEmail('Referee 2 email'),
    refereeTwoRelationship: optionalString(),
    areasOfInterest: z.array(z.string().trim().min(1)).optional(),
    committeeInterest: optionalString(),
    referralSource: optionalString(),
    linkedInProfileUrl: z.string().trim().url('LinkedIn / profile URL must be valid').optional().or(z.literal('')),
    willingnessToVolunteer: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.isLicensed && !data.regulatoryBody) {
      ctx.addIssue({
        code: 'custom',
        path: ['regulatoryBody'],
        message: 'Regulatory body is required when licensed',
      });
    }

    if (data.isLicensed && !data.yearOfRegistration) {
      ctx.addIssue({
        code: 'custom',
        path: ['yearOfRegistration'],
        message: 'Year of registration is required when licensed',
      });
    }
  });

export type EditableApplicantProfileValues = z.infer<typeof editableApplicantProfileSchema>;
