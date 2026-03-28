import { db } from '@/lib/db';
import { resolveMemberPortalPolicy } from '@/features/application/lib/member-portal-policy';
import { upsertBundledApplicationLedgerRecords, upsertPaymentLedgerRecord } from '@/features/payments/lib/ledger';
import { buildPaymentSummary } from '@/features/payments/lib/payment-config';
import type { ApplicationStatus, Prisma } from '@/prisma/src/generated/prisma/client';

const applicationInclude = {
  reviewedBy: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
  paymentIntent: true,
  paymentProofHistory: {
    orderBy: { archivedAt: 'desc' as const },
  },
  mpesaC2BReceipts: {
    orderBy: [{ transTime: 'desc' as const }, { createdAt: 'desc' as const }],
  },
  paymentRecords: {
    orderBy: [{ paidAt: 'desc' as const }, { createdAt: 'desc' as const }],
    include: {
      recordedBy: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  },
};

async function generateMembershipNumber(tx: Prisma.TransactionClient) {
  const year = new Date().getFullYear();
  const shortYear = String(year).slice(-2);
  const prefix = `IGA-${shortYear}`;
  const existingCount = await tx.membershipApplication.count({
    where: {
      membershipNumber: {
        startsWith: prefix,
      },
    },
  });

  let sequence = existingCount + 1;

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = `${prefix}-${String(sequence).padStart(4, '0')}`;
    const existing = await tx.membershipApplication.findFirst({
      where: { membershipNumber: candidate },
      select: { id: true },
    });

    if (!existing) {
      return candidate;
    }

    sequence += 1;
  }

  throw new Error('Unable to generate a unique membership number.');
}

async function hydrateActiveMemberPortal(applicationId: string) {
  await db.$transaction(async (tx) => {
    const existing = await tx.membershipApplication.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        status: true,
        membershipNumber: true,
        createdAt: true,
        paymentCollectionMode: true,
        paymentMethod: true,
        payerPhoneNumber: true,
        paymentBaseAmount: true,
        paymentTaxAmount: true,
        paymentTotalAmount: true,
        currency: true,
        transactionReferenceNumber: true,
        paymentProofUrl: true,
        paymentProofOriginalName: true,
        reviewedById: true,
      },
    });

    if (!existing || existing.status !== 'ACTIVE') {
      return;
    }

    const hasLegacyMembershipNumber =
      typeof existing.membershipNumber === 'string' && /^(IGANO-PDA-\d{4}-\d{4}|IGANO-\d{4}-\d{4})$/.test(existing.membershipNumber);

    if (!existing.membershipNumber || hasLegacyMembershipNumber) {
      const membershipNumber = await generateMembershipNumber(tx);
      await tx.membershipApplication.update({
        where: { id: existing.id },
        data: { membershipNumber },
      });
    }

    const existingPaymentRecord = await tx.membershipPaymentRecord.findFirst({
      where: existing.transactionReferenceNumber
        ? {
            applicationId: existing.id,
            transactionReferenceNumber: existing.transactionReferenceNumber,
          }
        : {
            applicationId: existing.id,
          },
      select: { id: true },
    });

    if (!existingPaymentRecord && existing.transactionReferenceNumber) {
      const paymentSummary = buildPaymentSummary(await tx.applicationPortalSetting.findUnique({ where: { singletonKey: 'default' } }));

      if (paymentSummary.includeRenewalFeeInApplication && paymentSummary.bundledRenewalFee > 0) {
        await upsertBundledApplicationLedgerRecords(tx, {
          applicationId: existing.id,
          billingYear: existing.createdAt.getFullYear(),
          collectionMode: existing.paymentCollectionMode,
          paymentMethod: existing.paymentMethod,
          transactionReferenceNumber: existing.transactionReferenceNumber,
          externalReference: existing.paymentCollectionMode === 'MPESA_DARAJA' ? existing.transactionReferenceNumber : null,
          payerPhoneNumber: existing.payerPhoneNumber,
          currency: existing.currency,
          status: 'VERIFIED',
          verificationStatus: 'VERIFIED',
          proofUrl: existing.paymentProofUrl,
          proofOriginalName: existing.paymentProofOriginalName,
          paidAt: existing.createdAt,
          recordedById: existing.reviewedById,
          notes: 'Backfilled for an already-approved member record.',
          applicationBaseAmount: paymentSummary.applicationFee,
          applicationTaxAmount: paymentSummary.applicationTaxAmount,
          renewalBaseAmount: paymentSummary.bundledRenewalFee,
          renewalTaxAmount: paymentSummary.renewalTaxAmount,
          applicationDescription: 'Initial application payment',
          renewalDescription: `Initial renewal payment - ${existing.createdAt.getFullYear()}`,
        });
      } else {
        const totalAmount = existing.paymentTotalAmount ?? existing.paymentBaseAmount ?? 0;
        const baseAmount = existing.paymentBaseAmount ?? totalAmount;
        const taxAmount = existing.paymentTaxAmount ?? Math.max(totalAmount - baseAmount, 0);

        await upsertPaymentLedgerRecord(tx, {
          applicationId: existing.id,
          purpose: 'APPLICATION_FEE',
          billingYear: null,
          collectionMode: existing.paymentCollectionMode,
          paymentMethod: existing.paymentMethod,
          transactionReferenceNumber: existing.transactionReferenceNumber,
          externalReference: existing.paymentCollectionMode === 'MPESA_DARAJA' ? existing.transactionReferenceNumber : null,
          payerPhoneNumber: existing.payerPhoneNumber,
          amount: totalAmount,
          baseAmount,
          taxAmount,
          totalAmount,
          currency: existing.currency,
          verificationStatus: 'VERIFIED',
          description: 'Initial application payment',
          notes: 'Backfilled for an already-approved member record.',
          proofUrl: existing.paymentProofUrl,
          proofOriginalName: existing.paymentProofOriginalName,
          status: 'VERIFIED',
          paidAt: existing.createdAt,
          recordedById: existing.reviewedById,
        });
      }
    }
  });
}

export async function getApplicationByUserId(userId: string) {
  try {
    let application = await db.membershipApplication.findUnique({
      where: { userId },
      include: applicationInclude,
    });

    if (application?.status === 'ACTIVE' && (!application.membershipNumber || application.paymentRecords.length === 0)) {
      await hydrateActiveMemberPortal(application.id);
      application = await db.membershipApplication.findUnique({
        where: { userId },
        include: applicationInclude,
      });
    }

    return application;
  } catch {
    return null;
  }
}

export async function getApplicationById(applicationId: string) {
  try {
    let application = await db.membershipApplication.findUnique({
      where: { id: applicationId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        ...applicationInclude,
      },
    });

    if (application?.status === 'ACTIVE' && (!application.membershipNumber || application.paymentRecords.length === 0)) {
      await hydrateActiveMemberPortal(application.id);
      application = await db.membershipApplication.findUnique({
        where: { id: applicationId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
          ...applicationInclude,
        },
      });
    }

    return application;
  } catch {
    return null;
  }
}

export async function getApplicationDraftByUserId(userId: string) {
  try {
    return await db.applicationDraft.findUnique({
      where: { userId },
    });
  } catch {
    return null;
  }
}

export async function getApplicantProfileByUserId(userId: string) {
  try {
    return await db.applicantProfile.findUnique({
      where: { userId },
    });
  } catch {
    return null;
  }
}

export async function getApplicationByEmail(email: string) {
  try {
    return await db.membershipApplication.findFirst({
      where: { email },
      orderBy: { createdAt: 'desc' },
      include: {
        paymentProofHistory: {
          orderBy: { archivedAt: 'desc' },
        },
      },
    });
  } catch {
    return null;
  }
}

export async function getApplicationLinkOptions() {
  return db.membershipApplication.findMany({
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    take: 150,
    select: {
      id: true,
      firstName: true,
      surname: true,
      email: true,
      status: true,
      membershipCategory: true,
      county: true,
    },
  });
}

export async function getApplicationSummary(status?: ApplicationStatus) {
  return db.membershipApplication.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
      reviewedBy: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
      paymentProofHistory: {
        orderBy: { archivedAt: 'desc' },
      },
    },
  });
}

export async function getApplicationCounts() {
  const [pending, active, rejected] = await Promise.all([
    db.membershipApplication.count({ where: { status: 'PENDING' } }),
    db.membershipApplication.count({ where: { status: 'ACTIVE' } }),
    db.membershipApplication.count({ where: { status: 'REJECTED' } }),
  ]);

  return { pending, active, rejected };
}

type CountyReportRow = {
  countyCode: string | null;
  county: string;
  pending: number;
  active: number;
  rejected: number;
  total: number;
};

export async function getCountyMembershipReport() {
  const grouped = await db.membershipApplication.groupBy({
    by: ['countyCode', 'county', 'status'],
    _count: { _all: true },
  });

  const countyMap = new Map<string, CountyReportRow>();

  for (const row of grouped) {
    const key = row.countyCode ?? row.county;
    const current = countyMap.get(key) ?? {
      countyCode: row.countyCode,
      county: row.county,
      pending: 0,
      active: 0,
      rejected: 0,
      total: 0,
    };

    current.total += row._count._all;

    if (row.status === 'PENDING') current.pending += row._count._all;
    if (row.status === 'ACTIVE') current.active += row._count._all;
    if (row.status === 'REJECTED') current.rejected += row._count._all;

    countyMap.set(key, current);
  }

  const rows = [...countyMap.values()].sort((left, right) => {
    if (right.total !== left.total) return right.total - left.total;
    return left.county.localeCompare(right.county);
  });

  const topActiveCounty = [...rows].sort((left, right) => {
    if (right.active !== left.active) return right.active - left.active;
    return left.county.localeCompare(right.county);
  })[0] ?? null;

  const topPendingCounty = [...rows].sort((left, right) => {
    if (right.pending !== left.pending) return right.pending - left.pending;
    return left.county.localeCompare(right.county);
  })[0] ?? null;

  return {
    rows,
    representedCountyCount: rows.length,
    topActiveCounty,
    topPendingCounty,
  };
}


type CategoryReportRow = {
  membershipCategoryId: string;
  membershipCategory: string;
  pending: number;
  active: number;
  rejected: number;
  total: number;
};

export async function getCategoryMembershipReport() {
  const grouped = await db.membershipApplication.groupBy({
    by: ['membershipCategoryId', 'membershipCategory', 'status'],
    _count: { _all: true },
  });

  const categoryMap = new Map<string, CategoryReportRow>();

  for (const row of grouped) {
    const current = categoryMap.get(row.membershipCategoryId) ?? {
      membershipCategoryId: row.membershipCategoryId,
      membershipCategory: row.membershipCategory,
      pending: 0,
      active: 0,
      rejected: 0,
      total: 0,
    };

    current.total += row._count._all;

    if (row.status === 'PENDING') current.pending += row._count._all;
    if (row.status === 'ACTIVE') current.active += row._count._all;
    if (row.status === 'REJECTED') current.rejected += row._count._all;

    categoryMap.set(row.membershipCategoryId, current);
  }

  const rows = [...categoryMap.values()].sort((left, right) => {
    if (right.total !== left.total) return right.total - left.total;
    return left.membershipCategory.localeCompare(right.membershipCategory);
  });

  const topActiveCategory = [...rows].sort((left, right) => {
    if (right.active !== left.active) return right.active - left.active;
    return left.membershipCategory.localeCompare(right.membershipCategory);
  })[0] ?? null;

  const topPendingCategory = [...rows].sort((left, right) => {
    if (right.pending !== left.pending) return right.pending - left.pending;
    return left.membershipCategory.localeCompare(right.membershipCategory);
  })[0] ?? null;

  return {
    rows,
    representedCategoryCount: rows.length,
    topActiveCategory,
    topPendingCategory,
  };
}

export async function getCategoryMembershipExportRows() {
  const report = await getCategoryMembershipReport();
  return report.rows;
}

type ReviewerWorkloadRow = {
  reviewerId: string;
  reviewerName: string;
  reviewedCount: number;
  approvedCount: number;
  rejectedCount: number;
  averageDecisionHours: number;
};

type RejectionReasonRow = {
  reason: string;
  count: number;
};

type ResubmissionBucketRow = {
  label: string;
  count: number;
};

function toHours(start: Date, end: Date) {
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
}

function roundToSingleDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

function median(values: number[]) {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

export async function getOperationalAnalytics() {
  const applications = await db.membershipApplication.findMany({
    select: {
      id: true,
      firstName: true,
      surname: true,
      email: true,
      status: true,
      createdAt: true,
      reviewedAt: true,
      reviewedById: true,
      reviewedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      rejectionReason: true,
      resubmissionCount: true,
    },
  });

  const decidedApplications = applications.filter((application) => application.reviewedAt);
  const decisionHours = decidedApplications.map((application) => toHours(application.createdAt, application.reviewedAt!));

  const reviewerMap = new Map<string, ReviewerWorkloadRow & { totalDecisionHours: number }>();

  for (const application of decidedApplications) {
    if (!application.reviewedById || !application.reviewedBy) {
      continue;
    }

    const current = reviewerMap.get(application.reviewedById) ?? {
      reviewerId: application.reviewedById,
      reviewerName: application.reviewedBy.name || application.reviewedBy.email || 'Unknown reviewer',
      reviewedCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      averageDecisionHours: 0,
      totalDecisionHours: 0,
    };

    current.reviewedCount += 1;
    current.totalDecisionHours += toHours(application.createdAt, application.reviewedAt!);

    if (application.status === 'ACTIVE') current.approvedCount += 1;
    if (application.status === 'REJECTED') current.rejectedCount += 1;

    reviewerMap.set(application.reviewedById, current);
  }

  const reviewerWorkload = [...reviewerMap.values()]
    .map((row) => ({
      reviewerId: row.reviewerId,
      reviewerName: row.reviewerName,
      reviewedCount: row.reviewedCount,
      approvedCount: row.approvedCount,
      rejectedCount: row.rejectedCount,
      averageDecisionHours: row.reviewedCount > 0 ? roundToSingleDecimal(row.totalDecisionHours / row.reviewedCount) : 0,
    }))
    .sort((left, right) => {
      if (right.reviewedCount !== left.reviewedCount) return right.reviewedCount - left.reviewedCount;
      return left.reviewerName.localeCompare(right.reviewerName);
    });

  const rejectionReasonMap = new Map<string, number>();
  for (const application of applications) {
    if (application.status !== 'REJECTED') continue;
    const reason = application.rejectionReason?.trim() || 'No reason recorded';
    rejectionReasonMap.set(reason, (rejectionReasonMap.get(reason) ?? 0) + 1);
  }

  const rejectionReasons: RejectionReasonRow[] = [...rejectionReasonMap.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return left.reason.localeCompare(right.reason);
    });

  const resubmissionBuckets: ResubmissionBucketRow[] = [
    { label: 'No resubmission', count: 0 },
    { label: 'One resubmission', count: 0 },
    { label: 'Two or more', count: 0 },
  ];

  for (const application of applications) {
    if (application.resubmissionCount <= 0) {
      resubmissionBuckets[0].count += 1;
    } else if (application.resubmissionCount === 1) {
      resubmissionBuckets[1].count += 1;
    } else {
      resubmissionBuckets[2].count += 1;
    }
  }

  const mostResubmitted = [...applications]
    .filter((application) => application.resubmissionCount > 0)
    .sort((left, right) => {
      if (right.resubmissionCount !== left.resubmissionCount) return right.resubmissionCount - left.resubmissionCount;
      return left.createdAt.getTime() - right.createdAt.getTime();
    })
    .slice(0, 5)
    .map((application) => ({
      id: application.id,
      applicantName: `${application.firstName} ${application.surname}`.trim(),
      email: application.email,
      resubmissionCount: application.resubmissionCount,
      status: application.status,
    }));

  const totalResubmissions = applications.reduce((sum, application) => sum + application.resubmissionCount, 0);
  const applicationsWithResubmissions = applications.filter((application) => application.resubmissionCount > 0).length;

  return {
    reviewedCount: decidedApplications.length,
    averageDecisionHours: decisionHours.length > 0 ? roundToSingleDecimal(decisionHours.reduce((sum, hours) => sum + hours, 0) / decisionHours.length) : 0,
    medianDecisionHours: decisionHours.length > 0 ? roundToSingleDecimal(median(decisionHours)) : 0,
    reviewerWorkload,
    rejectionReasons,
    totalResubmissions,
    applicationsWithResubmissions,
    resubmissionBuckets,
    mostResubmitted,
  };
}

export type AdminApplicationSortField = 'updatedAt' | 'createdAt' | 'surname' | 'county' | 'status' | 'resubmissionCount';
export type AdminApplicationView = 'all' | 'pending_only' | 'rejected_payment_issue' | 'needs_correction';

export type AdminApplicationTableParams = {
  page?: number;
  pageSize?: number;
  query?: string;
  statuses?: ApplicationStatus[];
  counties?: string[];
  categoryIds?: string[];
  sortField?: AdminApplicationSortField;
  sortDirection?: 'asc' | 'desc';
  view?: AdminApplicationView;
};

function buildAdminApplicationWhere(params: AdminApplicationTableParams): Prisma.MembershipApplicationWhereInput | undefined {
  const query = params.query?.trim();
  const statuses = [...new Set((params.statuses ?? []).filter(Boolean))];
  const counties = [...new Set((params.counties ?? []).map((value) => value.trim()).filter(Boolean))];
  const categoryIds = [...new Set((params.categoryIds ?? []).map((value) => value.trim()).filter(Boolean))];
  const view = params.view ?? 'all';

  const andFilters: Prisma.MembershipApplicationWhereInput[] = [];

  if (statuses.length > 0) {
    andFilters.push({ status: { in: statuses } });
  }

  if (counties.length > 0) {
    andFilters.push({ county: { in: counties } });
  }

  if (categoryIds.length > 0) {
    andFilters.push({ membershipCategoryId: { in: categoryIds } });
  }

  if (query) {
    andFilters.push({
      OR: [
        { firstName: { contains: query, mode: 'insensitive' } },
        { surname: { contains: query, mode: 'insensitive' } },
        { email: { contains: query, mode: 'insensitive' } },
        { idNumber: { contains: query, mode: 'insensitive' } },
        { county: { contains: query, mode: 'insensitive' } },
        { membershipCategory: { contains: query, mode: 'insensitive' } },
      ],
    });
  }

  if (view === 'pending_only') {
    andFilters.push({ status: 'PENDING' });
  }

  if (view === 'rejected_payment_issue') {
    andFilters.push({
      status: 'REJECTED',
      OR: [
        { flaggedFields: { has: 'paymentProof' } },
        { flaggedSections: { has: 'payment-declaration' } },
      ],
    });
  }

  if (view === 'needs_correction') {
    andFilters.push({
      status: 'REJECTED',
      OR: [
        { flaggedFields: { isEmpty: false } },
        { flaggedSections: { isEmpty: false } },
      ],
    });
  }

  return andFilters.length > 0 ? { AND: andFilters } : undefined;
}

function buildAdminApplicationOrderBy(params: AdminApplicationTableParams) {
  const sortField = params.sortField ?? 'updatedAt';
  const sortDirection = params.sortDirection ?? 'desc';

  return sortField === 'resubmissionCount'
    ? { resubmissionCount: sortDirection }
    : sortField === 'surname'
      ? { surname: sortDirection }
      : sortField === 'county'
        ? { county: sortDirection }
        : sortField === 'status'
          ? { status: sortDirection }
          : sortField === 'createdAt'
            ? { createdAt: sortDirection }
            : { updatedAt: sortDirection };
}

const adminApplicationInclude = {
  user: { select: { id: true, email: true, name: true } },
  reviewedBy: { select: { id: true, email: true, name: true } },
  paymentProofHistory: { orderBy: { archivedAt: 'desc' as const } },
};

export async function getAdminApplicationTable(params: AdminApplicationTableParams) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(50, Math.max(5, params.pageSize ?? 10));
  const where = buildAdminApplicationWhere(params);
  const orderBy = buildAdminApplicationOrderBy(params);

  const [totalCount, items] = await Promise.all([
    db.membershipApplication.count({ where }),
    db.membershipApplication.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: adminApplicationInclude,
    }),
  ]);

  return {
    items,
    totalCount,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    sortField: params.sortField ?? 'updatedAt',
    sortDirection: params.sortDirection ?? 'desc',
    view: params.view ?? 'all',
  };
}

export async function getAdminApplicationExportRows(params: AdminApplicationTableParams) {
  const where = buildAdminApplicationWhere(params);
  const orderBy = buildAdminApplicationOrderBy(params);

  return db.membershipApplication.findMany({
    where,
    orderBy,
    include: adminApplicationInclude,
  });
}

export async function getReviewerWorkloadExportRows() {
  const analytics = await getOperationalAnalytics();

  return analytics.reviewerWorkload.map((reviewer) => ({
    reviewerName: reviewer.reviewerName,
    reviewedCount: reviewer.reviewedCount,
    approvedCount: reviewer.approvedCount,
    rejectedCount: reviewer.rejectedCount,
    averageDecisionHours: reviewer.averageDecisionHours,
  }));
}

export async function getOperationalAnalysisExportRows() {
  const analytics = await getOperationalAnalytics();

  return {
    rejectionReasons: analytics.rejectionReasons,
    resubmissionBuckets: analytics.resubmissionBuckets,
    mostResubmitted: analytics.mostResubmitted,
    summary: {
      reviewedCount: analytics.reviewedCount,
      averageDecisionHours: analytics.averageDecisionHours,
      medianDecisionHours: analytics.medianDecisionHours,
      applicationsWithResubmissions: analytics.applicationsWithResubmissions,
      totalResubmissions: analytics.totalResubmissions,
    },
  };
}

type HeaderNotificationItem = {
  id: string;
  kind: 'application' | 'payment_activity' | 'payment_incident' | 'portal_warning';
  title: string;
  detail: string;
  href: string;
  severity: 'info' | 'warning' | 'critical';
  createdAt: Date;
  unread: boolean;
};

function buildNotificationId(prefix: string, id: string, createdAt: Date | string) {
  const stamp = createdAt instanceof Date ? createdAt.toISOString() : new Date(createdAt).toISOString();
  return `${prefix}-${id}-${stamp}`;
}

function finalizeNotifications(items: HeaderNotificationItem[], dismissedIds: string[], lastReadAt: Date | null) {
  const dismissed = new Set(dismissedIds);

  const visibleItems = items
    .filter((item) => !dismissed.has(item.id))
    .map((item) => ({
      ...item,
      unread: lastReadAt ? item.createdAt > lastReadAt : item.unread,
    }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 8);

  return {
    unreadCount: visibleItems.filter((item) => item.unread).length,
    items: visibleItems,
  };
}

export async function getHeaderNotifications(isAdmin: boolean, userId?: string) {
  if (isAdmin) {
    const [recentApplications, recentMpesaRequests, openIncidents, readiness, notificationState] = await Promise.all([
      db.membershipApplication.findMany({
        orderBy: [{ updatedAt: 'desc' }],
        take: 6,
        select: {
          id: true,
          firstName: true,
          surname: true,
          status: true,
          updatedAt: true,
          rejectionReason: true,
          reviewedAt: true,
        },
      }),
      db.mpesaStkRequest.findMany({
        orderBy: [{ updatedAt: 'desc' }],
        take: 6,
        select: {
          id: true,
          status: true,
          phoneNumber: true,
          amount: true,
          mpesaReceiptNumber: true,
          resultDesc: true,
          updatedAt: true,
          applicationId: true,
          application: {
            select: {
              id: true,
              firstName: true,
              surname: true,
              email: true,
            },
          },
        },
      }),
      db.paymentIncident.findMany({
        where: { status: 'OPEN' },
        orderBy: [{ detectedAt: 'desc' }],
        take: 6,
        select: {
          id: true,
          title: true,
          detail: true,
          severity: true,
          detectedAt: true,
          applicationId: true,
        },
      }),
      db.applicationPortalSetting.findFirst({
        where: { singletonKey: 'default' },
        select: {
          isFormOpen: true,
          isAcceptingApplications: true,
          applicationFee: true,
        },
      }),
      db.userNotificationState.findUnique({
        where: { userId },
        select: {
          lastReadAt: true,
          dismissedNotificationIds: true,
        },
      }),
    ]);

    const lastReadAt = notificationState?.lastReadAt ?? null;
    const dismissedIds = notificationState?.dismissedNotificationIds ?? [];

    const applicationItems: HeaderNotificationItem[] = recentApplications.map((application) => {
      const createdAt = application.reviewedAt ?? application.updatedAt;
      return {
        id: buildNotificationId('application', application.id, createdAt),
        kind: 'application',
        title: `${application.firstName} ${application.surname}`.trim() || 'Application update',
        detail:
          application.status === 'REJECTED'
            ? `Rejected${application.rejectionReason ? `: ${application.rejectionReason}` : ''}`
            : application.status === 'ACTIVE'
              ? 'Approved and activated'
              : application.status === 'PENDING'
                ? 'Awaiting review'
                : 'Updated draft state',
        href: `/dashboard/applications/${application.id}`,
        severity: application.status === 'REJECTED' ? 'warning' : 'info',
        createdAt,
        unread: true,
      };
    });

    const paymentItems: HeaderNotificationItem[] = recentMpesaRequests.map((request) => ({
      id: buildNotificationId('payment-request', request.id, request.updatedAt),
      kind: 'payment_activity',
      title: request.application
        ? `${request.application.firstName} ${request.application.surname}`.trim() || request.application.email
        : `M-Pesa request  - ${request.phoneNumber}`,
      detail:
        request.status === 'SUCCESS' || request.status === 'VERIFIED'
          ? `Payment confirmed${request.mpesaReceiptNumber ? `  - ${request.mpesaReceiptNumber}` : ''}`
          : request.status === 'FAILED' || request.status === 'CANCELLED' || request.status === 'TIMEOUT'
            ? request.resultDesc || 'Payment attempt failed'
            : `Awaiting payment confirmation  - KES ${request.amount.toLocaleString()}`,
      href: request.applicationId ? `/dashboard/applications/${request.applicationId}#payment-intent-lifecycle` : '/dashboard/settings#daraja-settings',
      severity:
        request.status === 'FAILED' || request.status === 'CANCELLED' || request.status === 'TIMEOUT'
          ? 'warning'
          : 'info',
      createdAt: request.updatedAt,
      unread: true,
    }));

    const incidentItems: HeaderNotificationItem[] = openIncidents.map((incident) => ({
      id: buildNotificationId('incident', incident.id, incident.detectedAt),
      kind: 'payment_incident',
      title: incident.title,
      detail: incident.detail ?? 'Payment operations follow-up is required.',
      href: incident.applicationId ? `/dashboard/applications/${incident.applicationId}` : '/dashboard/payments',
      severity: incident.severity === 'CRITICAL' ? 'critical' : incident.severity === 'WARNING' ? 'warning' : 'info',
      createdAt: incident.detectedAt,
      unread: true,
    }));

    const portalWarnings: HeaderNotificationItem[] = [];
    if (!readiness?.isFormOpen || !readiness?.isAcceptingApplications) {
      const createdAt = new Date(readiness ? readiness.applicationFee : Date.now());
      portalWarnings.push({
        id: 'portal-warning-closed',
        kind: 'portal_warning',
        title: 'Application portal is not fully open',
        detail: 'Review portal readiness and intake settings.',
        href: '/dashboard/settings',
        severity: 'warning',
        createdAt,
        unread: true,
      });
    }

    if ((readiness?.applicationFee ?? 0) <= 0) {
      portalWarnings.push({
        id: 'portal-warning-fee',
        kind: 'portal_warning',
        title: 'Application fee needs attention',
        detail: 'Set a positive application fee in settings before go-live.',
        href: '/dashboard/settings',
        severity: 'warning',
        createdAt: new Date(),
        unread: true,
      });
    }

    return finalizeNotifications([...portalWarnings, ...incidentItems, ...paymentItems, ...applicationItems], dismissedIds, lastReadAt);
  }

  if (!userId) {
    return { unreadCount: 0, items: [] as HeaderNotificationItem[] };
  }

  const [application, latestRequest, portalSetting, notificationState] = await Promise.all([
    db.membershipApplication.findUnique({
      where: { userId },
      select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        rejectionReason: true,
        reviewedAt: true,
        membershipNumber: true,
        paymentRecords: {
          select: {
            purpose: true,
            status: true,
            billingYear: true,
            paidAt: true,
            createdAt: true,
          },
        },
      },
    }),
    db.mpesaStkRequest.findFirst({
      where: { userId },
      orderBy: [{ updatedAt: 'desc' }],
      select: {
        id: true,
        status: true,
        amount: true,
        resultDesc: true,
        mpesaReceiptNumber: true,
        updatedAt: true,
      },
    }),
    db.applicationPortalSetting.findUnique({
      where: { singletonKey: 'default' },
    }),
    db.userNotificationState.findUnique({
      where: { userId },
      select: {
        lastReadAt: true,
        dismissedNotificationIds: true,
      },
    }),
  ]);

  if (!application) {
    return { unreadCount: 0, items: [] as HeaderNotificationItem[] };
  }

  const lastReadAt = notificationState?.lastReadAt ?? null;
  const dismissedIds = notificationState?.dismissedNotificationIds ?? [];
  const applicationCreatedAt = application.reviewedAt ?? application.updatedAt;
  const policy = resolveMemberPortalPolicy(application, portalSetting);
  const items: HeaderNotificationItem[] = [
    {
      id: buildNotificationId('member-status', application.id, applicationCreatedAt),
      kind: 'application',
      title: 'Application status',
      detail:
        application.status === 'ACTIVE'
          ? `Approved${application.membershipNumber ? `  - ${application.membershipNumber}` : ''}`
          : application.status === 'REJECTED'
            ? `Rejected${application.rejectionReason ? `: ${application.rejectionReason}` : ''}`
            : 'Awaiting review',
      href: '/dashboard',
      severity: application.status === 'REJECTED' ? 'warning' : 'info',
      createdAt: applicationCreatedAt,
      unread: application.status === 'REJECTED',
    },
  ];

  if (latestRequest) {
    items.push({
      id: buildNotificationId('member-payment', latestRequest.id, latestRequest.updatedAt),
      kind: 'payment_activity',
      title: 'Payment update',
      detail:
        latestRequest.status === 'SUCCESS' || latestRequest.status === 'VERIFIED'
          ? `Payment confirmed${latestRequest.mpesaReceiptNumber ? `  - ${latestRequest.mpesaReceiptNumber}` : ''}`
          : latestRequest.status === 'FAILED' || latestRequest.status === 'CANCELLED' || latestRequest.status === 'TIMEOUT'
            ? latestRequest.resultDesc || 'Payment needs your attention'
            : `Awaiting payment confirmation  - KES ${latestRequest.amount.toLocaleString()}`,
      href: '/apply#payment-step',
      severity:
        latestRequest.status === 'FAILED' || latestRequest.status === 'CANCELLED' || latestRequest.status === 'TIMEOUT'
          ? 'warning'
          : 'info',
      createdAt: latestRequest.updatedAt,
      unread: true,
    });
  }

  if (application.status === 'ACTIVE' && policy.renewalsEnabled) {
    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const startOfYear = Date.UTC(currentYear, 0, 1);
    const today = Date.UTC(currentYear, now.getUTCMonth(), now.getUTCDate());
    const weeklyBucket = Math.floor((today - startOfYear) / 604800000);
    const cadenceKey =
      policy.renewalReminderFrequency === 'DAILY'
        ? now.toISOString().slice(0, 10)
        : policy.renewalReminderFrequency === 'MONTHLY'
          ? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
          : `${now.getUTCFullYear()}-w${String(weeklyBucket).padStart(2, '0')}`;

    if (policy.renewalDue) {
      items.push({
        id: `renewal-due-${application.id}-${policy.currentRenewalYear}`,
        kind: 'portal_warning',
        title: 'Renewal due',
        detail: policy.renewalSummary,
        href: '/dashboard',
        severity: 'warning',
        createdAt: now,
        unread: true,
      });
    } else if (policy.renewalReminderWindowOpen && policy.daysRemaining !== null) {
      items.push({
        id: `renewal-reminder-${application.id}-${policy.currentRenewalYear}-${cadenceKey}`,
        kind: 'portal_warning',
        title: 'Renewal due soon',
        detail: `${policy.daysRemaining} day${policy.daysRemaining === 1 ? '' : 's'} remaining before renewal is due.`,
        href: '/dashboard',
        severity: 'info',
        createdAt: now,
        unread: true,
      });
    }
  }

  return finalizeNotifications(items, dismissedIds, lastReadAt);
}
