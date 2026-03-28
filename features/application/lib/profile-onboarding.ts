import type { ApplicantProfile, MembershipApplication } from '@/prisma/src/generated/prisma/client';

import { buildProfilePrefillFromApplication } from '@/features/application/lib/field-ownership';
import { editableApplicantProfileSchema } from '@/features/application/schemas/profile';

function toRecord(value: unknown) {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export function getMergedApplicantProfileData(
  application: MembershipApplication | null,
  applicantProfile: ApplicantProfile | null,
) {
  return {
    ...(application ? buildProfilePrefillFromApplication(application) : {}),
    ...toRecord(applicantProfile?.data),
  };
}

export function getApplicantProfileCompletion(
  application: MembershipApplication | null,
  applicantProfile: ApplicantProfile | null,
) {
  const mergedProfileData = getMergedApplicantProfileData(application, applicantProfile);
  const parsed = editableApplicantProfileSchema.safeParse(mergedProfileData);

  return {
    isComplete: parsed.success,
    data: mergedProfileData,
    parsed,
  };
}

export function resolveMemberOnboardingPath(
  application: MembershipApplication | null,
  applicantProfile: ApplicantProfile | null,
) {
  const profile = getApplicantProfileCompletion(application, applicantProfile);

  if (!profile.isComplete) {
    return '/profile' as const;
  }

  if (!application || application.status === 'DRAFT') {
    return '/apply' as const;
  }

  return '/dashboard' as const;
}
