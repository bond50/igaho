import { auth } from '@/auth';
import { getReviewerWorkloadExportRows } from '@/features/application/queries/application';

function escapeCsv(value: string | number | null | undefined) {
  const stringValue = String(value ?? '');
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replaceAll('"', '""')}"`;
  }
  return stringValue;
}

export async function GET() {
  const session = await auth();

  if (!session?.user || session.user.role !== 'ADMIN') {
    return new Response('Unauthorized', { status: 401 });
  }

  const rows = await getReviewerWorkloadExportRows();
  const header = ['Reviewer', 'Reviewed Applications', 'Approved', 'Rejected', 'Average Decision Hours'];
  const csvLines = [
    header.join(','),
    ...rows.map((row) => [
      row.reviewerName,
      row.reviewedCount,
      row.approvedCount,
      row.rejectedCount,
      row.averageDecisionHours,
    ].map(escapeCsv).join(',')),
  ];

  const timestamp = new Date().toISOString().slice(0, 19).replaceAll(':', '-');

  return new Response(csvLines.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="reviewer-workload-${timestamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
