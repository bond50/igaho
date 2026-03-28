export const applicationReviewSections = [
  { id: 'personal-location', label: 'Identity and location profile', step: 0 },
  { id: 'contact-next-of-kin', label: 'Contact and next of kin profile', step: 0 },
  { id: 'professional-profile', label: 'Professional profile', step: 0 },
  { id: 'education-licensing', label: 'Education and licensing profile', step: 0 },
  { id: 'membership-referees', label: 'Membership category and referee profile', step: 0 },
  { id: 'payment-declaration', label: 'Payment and declaration', step: 1 },
] as const;

export type ApplicationReviewSectionId = (typeof applicationReviewSections)[number]['id'];

export function getApplicationReviewSectionLabel(sectionId: string) {
  return applicationReviewSections.find((section) => section.id === sectionId)?.label ?? sectionId;
}
