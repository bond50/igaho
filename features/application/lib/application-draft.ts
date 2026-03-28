import type { MembershipApplication } from '@/prisma/src/generated/prisma/client';

export function buildDraftFromRejectedApplication(application: MembershipApplication) {
  return {
    salutation: application.salutation,
    firstName: application.firstName,
    surname: application.surname,
    gender: application.gender,
    ageBracket: application.ageBracket,
    idNumber: application.idNumber,
    membershipType: application.membershipType,
    membershipCategoryId: application.membershipCategoryId,
    paymentMethod: application.paymentMethod,
    transactionReferenceNumber: application.transactionReferenceNumber,
    declarationConfirmed: application.declarationConfirmed,
    codeOfConductAccepted: application.codeOfConductAccepted,
    dataProcessingConsent: application.dataProcessingConsent,
    digitalSignature: application.digitalSignature,
    declarationDate: application.declarationDate.toISOString().slice(0, 10),
  };
}
