export const applicationReviewFieldOptions = [
  { id: 'idNumber', label: 'ID number mismatch', step: 0 },
  { id: 'countyCode', label: 'County or ward details', step: 0 },
  { id: 'phoneNumber', label: 'Phone number', step: 0 },
  { id: 'membershipCategoryId', label: 'Wrong membership category', step: 0 },
  { id: 'paymentProof', label: 'Payment proof invalid', step: 1 },
  { id: 'transactionReferenceNumber', label: 'Transaction reference number', step: 1 },
  { id: 'digitalSignature', label: 'Digital signature', step: 1 },
] as const;

export type ApplicationReviewFieldId = (typeof applicationReviewFieldOptions)[number]['id'];

export function getApplicationReviewFieldLabel(fieldId: string) {
  return applicationReviewFieldOptions.find((field) => field.id === fieldId)?.label ?? fieldId;
}
