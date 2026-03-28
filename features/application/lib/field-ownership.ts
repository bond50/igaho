import type { MembershipApplication } from '@/prisma/src/generated/prisma/client';

const profileOwnedFields = [
  'salutation',
  'firstName',
  'surname',
  'gender',
  'ageBracket',
  'idNumber',
  'countyCode',
  'county',
  'subCountyCode',
  'subCounty',
  'wardCode',
  'ward',
  'residenceAddress',
  'phoneNumber',
  'alternativePhoneNumber',
  'nextOfKinFirstName',
  'nextOfKinSurname',
  'nextOfKinRelationship',
  'nextOfKinPhone',
  'profession',
  'currentJobTitle',
  'employerOrOrganizationName',
  'workAddressOrLocation',
  'yearsOfExperience',
  'areasOfExpertise',
  'highestLevelOfEducation',
  'institutionForHighestDegree',
  'yearOfGraduationForHighestDegree',
  'isLicensed',
  'regulatoryBody',
  'yearOfRegistration',
  'preferredChapterOrRegion',
  'refereeOneName',
  'refereeOnePhone',
  'refereeOneEmail',
  'refereeOneRelationship',
  'refereeTwoName',
  'refereeTwoPhone',
  'refereeTwoEmail',
  'refereeTwoRelationship',
  'areasOfInterest',
  'willingnessToVolunteer',
  'committeeInterest',
  'referralSource',
  'linkedInProfileUrl',
] as const;

const applicationOwnedFields = [
  'membershipType',
  'membershipCategoryId',
  'paymentMethod',
  'payerPhoneNumber',
  'transactionReferenceNumber',
  'digitalSignature',
  'declarationDate',
  'declarationConfirmed',
  'codeOfConductAccepted',
  'dataProcessingConsent',
] as const;

export type ProfileOwnedField = (typeof profileOwnedFields)[number];
export type ApplicationOwnedField = (typeof applicationOwnedFields)[number];

function pickFields<T extends readonly string[]>(source: Record<string, unknown>, fields: T) {
  const result: Record<string, unknown> = {};

  for (const field of fields) {
    const value = source[field];
    if (value !== undefined) {
      result[field] = value;
    }
  }

  return result;
}

export function splitApplicationFormData(source: Record<string, unknown>) {
  return {
    profileData: pickFields(source, profileOwnedFields),
    applicationData: pickFields(source, applicationOwnedFields),
  };
}

export function buildProfilePrefillFromApplication(application: MembershipApplication) {
  return {
    salutation: application.salutation ?? '',
    firstName: application.firstName,
    surname: application.surname,
    gender: application.gender,
    ageBracket: application.ageBracket,
    idNumber: application.idNumber,
    countyCode: application.countyCode ?? '',
    county: application.county,
    subCountyCode: application.subCountyCode ?? '',
    subCounty: application.subCounty,
    wardCode: application.wardCode ?? '',
    ward: application.ward,
    residenceAddress: application.residenceAddress ?? '',
    phoneNumber: application.phoneNumber,
    alternativePhoneNumber: application.alternativePhoneNumber ?? '',
    nextOfKinFirstName: application.nextOfKinFirstName ?? '',
    nextOfKinSurname: application.nextOfKinSurname ?? '',
    nextOfKinRelationship: application.nextOfKinRelationship ?? '',
    nextOfKinPhone: application.nextOfKinPhone ?? '',
    profession: application.profession ?? '',
    currentJobTitle: application.currentJobTitle ?? '',
    employerOrOrganizationName: application.employerOrOrganizationName ?? '',
    workAddressOrLocation: application.workAddressOrLocation ?? '',
    yearsOfExperience: application.yearsOfExperience ?? '',
    areasOfExpertise: application.areasOfExpertise,
    highestLevelOfEducation: application.highestLevelOfEducation ?? '',
    institutionForHighestDegree: application.institutionForHighestDegree ?? '',
    yearOfGraduationForHighestDegree: application.yearOfGraduationForHighestDegree ?? '',
    isLicensed: application.isLicensed ? 'true' : 'false',
    regulatoryBody: application.regulatoryBody ?? '',
    yearOfRegistration: application.yearOfRegistration ?? '',
    preferredChapterOrRegion: application.preferredChapterOrRegion ?? '',
    refereeOneName: application.refereeOneName ?? '',
    refereeOnePhone: application.refereeOnePhone ?? '',
    refereeOneEmail: application.refereeOneEmail ?? '',
    refereeOneRelationship: application.refereeOneRelationship ?? '',
    refereeTwoName: application.refereeTwoName ?? '',
    refereeTwoPhone: application.refereeTwoPhone ?? '',
    refereeTwoEmail: application.refereeTwoEmail ?? '',
    refereeTwoRelationship: application.refereeTwoRelationship ?? '',
    areasOfInterest: application.areasOfInterest,
    willingnessToVolunteer:
      application.willingnessToVolunteer === null || application.willingnessToVolunteer === undefined
        ? ''
        : application.willingnessToVolunteer
          ? 'true'
          : 'false',
    committeeInterest: application.committeeInterest ?? '',
    referralSource: application.referralSource ?? '',
    linkedInProfileUrl: application.linkedInProfileUrl ?? '',
  };
}
