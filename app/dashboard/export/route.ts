import { auth } from '@/auth';
import { getAdminApplicationExportRows, type AdminApplicationSortField, type AdminApplicationView } from '@/features/application/queries/application';
import type { ApplicationStatus } from '@/prisma/src/generated/prisma/client';

function normalizeSearchValue(value: string | string[] | undefined) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0] ?? '';
  return '';
}

function normalizeSearchValues(value: string | string[] | undefined) {
  if (typeof value === 'string') return value ? [value] : [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return [];
}

function escapeCsv(value: string | null | undefined) {
  const stringValue = value ?? '';
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replaceAll('"', '""')}"`;
  }
  return stringValue;
}

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user || session.user.role !== 'ADMIN') {
    return new Response('Unauthorized', { status: 401 });
  }

  const url = new URL(request.url);
  const query = normalizeSearchValue(url.searchParams.getAll('q')[0]);
  const statuses = normalizeSearchValues(url.searchParams.getAll('statuses')) as ApplicationStatus[];
  const counties = normalizeSearchValues(url.searchParams.getAll('counties'));
  const categoryIds = normalizeSearchValues(url.searchParams.getAll('categories'));
  const view = (normalizeSearchValue(url.searchParams.get('view') ?? undefined) || 'all') as AdminApplicationView;
  const sortField = (normalizeSearchValue(url.searchParams.get('sort') ?? undefined) || 'updatedAt') as AdminApplicationSortField;
  const sortDirection = normalizeSearchValue(url.searchParams.get('direction') ?? undefined) === 'asc' ? 'asc' : 'desc';

  const rows = await getAdminApplicationExportRows({
    query,
    statuses,
    counties,
    categoryIds,
    sortField,
    sortDirection,
    view,
  });

  const header = [
    'Applicant Name',
    'Email',
    'Status',
    'Category',
    'Membership Type',
    'County',
    'Sub-County',
    'Ward',
    'Phone Number',
    'ID Number',
    'Payment Method',
    'Transaction Reference',
    'Resubmission Count',
    'Rejected At',
    'Resubmitted At',
    'Updated At',
    'Reviewed By',
    'Rejection Reason',
    'Review Notes',
    'Flagged Sections',
    'Flagged Fields',
  ];

  const csvLines = [
    header.join(','),
    ...rows.map((row) => [
      `${row.firstName} ${row.surname}`.trim(),
      row.email,
      row.status,
      row.membershipCategory,
      row.membershipType,
      row.county,
      row.subCounty,
      row.ward,
      row.phoneNumber,
      row.idNumber,
      row.paymentMethod,
      row.transactionReferenceNumber,
      String(row.resubmissionCount),
      row.rejectedAt?.toISOString() ?? '',
      row.resubmittedAt?.toISOString() ?? '',
      row.updatedAt.toISOString(),
      row.reviewedBy?.name ?? row.reviewedBy?.email ?? '',
      row.rejectionReason ?? '',
      row.reviewNotes ?? '',
      row.flaggedSections.join(' | '),
      row.flaggedFields.join(' | '),
    ].map(escapeCsv).join(',')),
  ];

  const timestamp = new Date().toISOString().slice(0, 19).replaceAll(':', '-');

  return new Response(csvLines.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="applications-export-${timestamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
