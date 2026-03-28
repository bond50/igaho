import type { ApplicationPortalSetting, MembershipApplication, MembershipPaymentRecord } from '@/prisma/src/generated/prisma/client';

type MembershipApplicationWithPayments = Pick<MembershipApplication, 'status' | 'createdAt' | 'reviewedAt'> & {
  paymentRecords: Pick<MembershipPaymentRecord, 'purpose' | 'status' | 'billingYear' | 'paidAt' | 'createdAt'>[];
};

export type MemberPortalPolicy = {
  isActiveMember: boolean;
  canAccessApplicationForm: boolean;
  renewalsEnabled: boolean;
  renewalMode: 'MANUAL_REVIEW' | 'PAY_AND_ACTIVATE';
  currentRenewalYear: number;
  renewalDue: boolean;
  renewalInGracePeriod: boolean;
  coveredThroughYear: number | null;
  coverageStartsAt: Date | null;
  coverageEndsAt: Date | null;
  graceEndsAt: Date | null;
  daysRemaining: number | null;
  renewalCoverageStartMonth: number;
  renewalCoverageStartDay: number;
  renewalCoverageEndMonth: number;
  renewalCoverageEndDay: number;
  renewalGraceDays: number;
  renewalReminderLeadDays: number;
  renewalReminderFrequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  renewalReminderWindowOpen: boolean;
  renewalReminderStartsInDays: number | null;
  includeRenewalFeeInApplication: boolean;
  coverageSource: 'Application bundle' | 'Renewal payment' | 'Admin approval';
  nextAction: string | null;
  canViewCertificate: boolean;
  canViewMembershipCard: boolean;
  membershipStateLabel: string;
  renewalSummary: string;
};

function getReviewedYear(application: MembershipApplicationWithPayments) {
  return (application.reviewedAt ?? application.createdAt).getFullYear();
}

function getLatestVerifiedRenewalYear(application: MembershipApplicationWithPayments) {
  return application.paymentRecords
    .filter((record) => record.purpose === 'ANNUAL_RENEWAL' && record.status === 'VERIFIED' && typeof record.billingYear === 'number')
    .reduce<number | null>((latest, record) => {
      if (typeof record.billingYear !== 'number') {
        return latest;
      }

      return latest === null ? record.billingYear : Math.max(latest, record.billingYear);
    }, null);
}

function getSafeCoveragePart(value: number | null | undefined, fallback: number, max: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(Math.round(value), 1), max);
}

function buildDate(year: number, month: number, day: number, endOfDay = false) {
  const date = new Date(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);

  if (date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return date;
}

function getCoverageWindow(year: number, setting: ApplicationPortalSetting | null) {
  const startMonth = getSafeCoveragePart(setting?.renewalCoverageStartMonth, 1, 12);
  const startDay = getSafeCoveragePart(setting?.renewalCoverageStartDay, 1, 31);
  const endMonth = getSafeCoveragePart(setting?.renewalCoverageEndMonth, 12, 12);
  const endDay = getSafeCoveragePart(setting?.renewalCoverageEndDay, 31, 31);
  const crossesYear = endMonth < startMonth || (endMonth === startMonth && endDay < startDay);

  const startsAt = buildDate(year, startMonth, startDay);
  const endsAt = buildDate(crossesYear ? year + 1 : year, endMonth, endDay, true);

  return {
    startsAt,
    endsAt,
    startMonth,
    startDay,
    endMonth,
    endDay,
  };
}

function getCurrentCoverageYear(now: Date, setting: ApplicationPortalSetting | null) {
  const startMonth = getSafeCoveragePart(setting?.renewalCoverageStartMonth, 1, 12);
  const startDay = getSafeCoveragePart(setting?.renewalCoverageStartDay, 1, 31);
  const candidateStart = buildDate(now.getFullYear(), startMonth, startDay);

  if (!candidateStart) {
    return now.getFullYear();
  }

  return now >= candidateStart ? now.getFullYear() : now.getFullYear() - 1;
}

function getDaysRemaining(target: Date, now: Date) {
  const diff = target.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / 86400000));
}

function formatCoverageDate(date: Date) {
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDays(count: number) {
  return `${count} day${count === 1 ? '' : 's'}`;
}

export function resolveMemberPortalPolicy(
  application: MembershipApplicationWithPayments | null,
  setting: ApplicationPortalSetting | null,
  now = new Date(),
): MemberPortalPolicy {
  const renewalsEnabled = setting?.renewalsEnabled ?? false;
  const renewalMode = setting?.renewalMode ?? 'MANUAL_REVIEW';
  const renewalCoverageStartMonth = getSafeCoveragePart(setting?.renewalCoverageStartMonth, 1, 12);
  const renewalCoverageStartDay = getSafeCoveragePart(setting?.renewalCoverageStartDay, 1, 31);
  const renewalCoverageEndMonth = getSafeCoveragePart(setting?.renewalCoverageEndMonth, 12, 12);
  const renewalCoverageEndDay = getSafeCoveragePart(setting?.renewalCoverageEndDay, 31, 31);
  const renewalGraceDays = Math.max(setting?.renewalGraceDays ?? 0, 0);
  const renewalReminderLeadDays = Math.max(setting?.renewalReminderLeadDays ?? 30, 0);
  const renewalReminderFrequency = setting?.renewalReminderFrequency ?? 'WEEKLY';
  const includeRenewalFeeInApplication = setting?.includeRenewalFeeInApplication ?? false;
  const currentRenewalYear = getCurrentCoverageYear(now, setting);
  const isActiveMember = application?.status === 'ACTIVE';
  const canAccessApplicationForm = !application
    || application.status === 'DRAFT'
    || application.status === 'REJECTED'
    || (application.status === 'ACTIVE' && (setting?.showApplicationFormAfterApproval ?? false));

  if (!application || !isActiveMember) {
    return {
      isActiveMember: false,
      canAccessApplicationForm,
      renewalsEnabled,
      renewalMode,
      currentRenewalYear,
      renewalDue: false,
      renewalInGracePeriod: false,
      coveredThroughYear: null,
      coverageStartsAt: null,
      coverageEndsAt: null,
      graceEndsAt: null,
      daysRemaining: null,
      renewalCoverageStartMonth,
      renewalCoverageStartDay,
      renewalCoverageEndMonth,
      renewalCoverageEndDay,
      renewalGraceDays,
      renewalReminderLeadDays,
      renewalReminderFrequency,
      renewalReminderWindowOpen: false,
      renewalReminderStartsInDays: null,
      includeRenewalFeeInApplication,
      coverageSource: 'Admin approval',
      nextAction: null,
      canViewCertificate: false,
      canViewMembershipCard: false,
      membershipStateLabel:
        application?.status === 'PENDING'
          ? 'Under review'
          : application?.status === 'REJECTED'
            ? 'Needs correction'
            : 'Application draft',
      renewalSummary: renewalsEnabled
        ? `Renewals are active for ${currentRenewalYear}.`
        : 'Renewals are currently disabled.',
    };
  }

  const reviewedYear = getReviewedYear(application);
  const latestVerifiedRenewalYear = getLatestVerifiedRenewalYear(application);
  const coveredThroughYear = Math.max(reviewedYear, latestVerifiedRenewalYear ?? reviewedYear);
  const coverageWindow = getCoverageWindow(coveredThroughYear, setting);
  const coverageStartsAt = coverageWindow.startsAt;
  const coverageEndsAt = coverageWindow.endsAt;
  const graceEndsAt = coverageEndsAt ? new Date(coverageEndsAt.getTime() + renewalGraceDays * 86400000) : null;
  const daysRemaining = coverageEndsAt && now <= coverageEndsAt ? getDaysRemaining(coverageEndsAt, now) : null;
  const renewalReminderWindowOpen = renewalsEnabled
    && !!coverageEndsAt
    && now <= coverageEndsAt
    && daysRemaining !== null
    && daysRemaining <= renewalReminderLeadDays;
  const renewalReminderStartsInDays = renewalsEnabled
    && !!coverageEndsAt
    && now <= coverageEndsAt
    && daysRemaining !== null
    && daysRemaining > renewalReminderLeadDays
      ? daysRemaining - renewalReminderLeadDays
      : 0;
  const renewalInGracePeriod = renewalsEnabled && !!coverageEndsAt && !!graceEndsAt && now > coverageEndsAt && now <= graceEndsAt;
  const renewalDue = renewalsEnabled && (coveredThroughYear < currentRenewalYear || renewalInGracePeriod || (!!coverageEndsAt && now > coverageEndsAt));

  const canViewCertificate = renewalDue
    ? (setting?.showCertificateWhenRenewalDue ?? false)
    : (setting?.showCertificateToActiveMembers ?? true);
  const canViewMembershipCard = renewalDue
    ? (setting?.showMembershipCardWhenRenewalDue ?? false)
    : (setting?.showMembershipCardToActiveMembers ?? true);

  let membershipStateLabel = 'Active';
  if (renewalInGracePeriod) {
    membershipStateLabel = 'Grace period';
  } else if (renewalDue) {
    membershipStateLabel = 'Due now';
  } else if (renewalReminderWindowOpen) {
    membershipStateLabel = 'Due soon';
  }

  const coverageSource = includeRenewalFeeInApplication && latestVerifiedRenewalYear !== null && latestVerifiedRenewalYear >= reviewedYear
    ? 'Application bundle'
    : latestVerifiedRenewalYear !== null
      ? 'Renewal payment'
      : 'Admin approval';

  let nextAction: string | null = null;
  if (renewalInGracePeriod || renewalDue) {
    nextAction = 'Pay renewal';
  } else if (renewalReminderWindowOpen) {
    nextAction = 'Renewal opens';
  }

  let renewalSummary = 'Renewals are currently disabled by the admin team.';

  if (renewalsEnabled && coverageStartsAt && coverageEndsAt) {
    const coverageRange = `${formatCoverageDate(coverageStartsAt)} to ${formatCoverageDate(coverageEndsAt)}`;

    if (renewalInGracePeriod && graceEndsAt) {
      renewalSummary = `Coverage ended on ${formatCoverageDate(coverageEndsAt)}. Grace period ends on ${formatCoverageDate(graceEndsAt)}.`;
    } else if (renewalDue) {
      renewalSummary = `Renewal payment is due. Coverage ran from ${coverageRange}.`;
    } else if (renewalReminderWindowOpen && daysRemaining !== null) {
      renewalSummary = `${formatDays(daysRemaining)} remaining. Coverage runs ${coverageRange}.`;
    } else {
      renewalSummary = `Coverage runs ${coverageRange}.`;
    }
  }

  return {
    isActiveMember: true,
    canAccessApplicationForm,
    renewalsEnabled,
    renewalMode,
    currentRenewalYear,
    renewalDue,
    renewalInGracePeriod,
    coveredThroughYear,
    coverageStartsAt,
    coverageEndsAt,
    graceEndsAt,
    daysRemaining,
    renewalCoverageStartMonth,
    renewalCoverageStartDay,
    renewalCoverageEndMonth,
    renewalCoverageEndDay,
    renewalGraceDays,
    renewalReminderLeadDays,
    renewalReminderFrequency,
    renewalReminderWindowOpen,
    renewalReminderStartsInDays,
    includeRenewalFeeInApplication,
    coverageSource,
    nextAction,
    canViewCertificate,
    canViewMembershipCard,
    membershipStateLabel,
    renewalSummary,
  };
}
