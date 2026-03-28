import { auth } from '@/auth';
import { getOperationalAnalysisExportRows } from '@/features/application/queries/application';

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

  const analytics = await getOperationalAnalysisExportRows();
  const sections: string[] = [];

  sections.push([
    'Metric,Value',
    `Reviewed applications,${escapeCsv(analytics.summary.reviewedCount)}`,
    `Average decision hours,${escapeCsv(analytics.summary.averageDecisionHours)}`,
    `Median decision hours,${escapeCsv(analytics.summary.medianDecisionHours)}`,
    `Applications with resubmissions,${escapeCsv(analytics.summary.applicationsWithResubmissions)}`,
    `Total resubmissions,${escapeCsv(analytics.summary.totalResubmissions)}`,
  ].join('\n'));

  sections.push([
    'Rejection Reason,Count',
    ...analytics.rejectionReasons.map((row) => [row.reason, row.count].map(escapeCsv).join(',')),
  ].join('\n'));

  sections.push([
    'Resubmission Bucket,Count',
    ...analytics.resubmissionBuckets.map((row) => [row.label, row.count].map(escapeCsv).join(',')),
  ].join('\n'));

  sections.push([
    'Applicant,Email,Status,Resubmissions',
    ...analytics.mostResubmitted.map((row) => [row.applicantName, row.email, row.status, row.resubmissionCount].map(escapeCsv).join(',')),
  ].join('\n'));

  const timestamp = new Date().toISOString().slice(0, 19).replaceAll(':', '-');

  return new Response(sections.join('\n\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="operations-analysis-${timestamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
