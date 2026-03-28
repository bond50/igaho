import { auth } from '@/auth';
import { getCategoryMembershipExportRows } from '@/features/application/queries/application';

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

  const rows = await getCategoryMembershipExportRows();
  const header = ['Membership Category', 'Total', 'Active', 'Pending', 'Rejected'];
  const csvLines = [
    header.join(','),
    ...rows.map((row) => [
      row.membershipCategory,
      row.total,
      row.active,
      row.pending,
      row.rejected,
    ].map(escapeCsv).join(',')),
  ];

  const timestamp = new Date().toISOString().slice(0, 19).replaceAll(':', '-');

  return new Response(csvLines.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="category-summary-${timestamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
