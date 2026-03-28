import Link from 'next/link';

import {redirect} from 'next/navigation';

import {auth} from '@/auth';

import {AppShell} from '@/components/layout/app-shell';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {Separator} from '@/components/ui/separator';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {AdminApplicationsDataTable} from '@/features/application/components/admin-applications-data-table';
import {DashboardQueueFilters} from '@/features/application/components/dashboard-queue-filters';
import {CircleHelp, MoreHorizontal} from 'lucide-react';

import {reviseRejectedApplication} from '@/features/application/actions/application';

import {getApplicationReviewFieldLabel} from '@/features/application/lib/review-fields';

import {getApplicationReviewSectionLabel} from '@/features/application/lib/review-sections';

import {

    getAdminApplicationTable,

    getApplicationByUserId,
    getApplicantProfileByUserId,

    getApplicationCounts,

    getCategoryMembershipReport,

    getCountyMembershipReport,

    getOperationalAnalytics,

    type AdminApplicationSortField,

    type AdminApplicationView,

} from '@/features/application/queries/application';

import { getPortalBranding } from '@/features/application/queries/settings';
import {getMembershipCategories} from '@/features/application/queries/settings';
import { getHeaderNotifications } from '@/features/application/queries/application';
import { resolveMemberOnboardingPath } from '@/features/application/lib/profile-onboarding';
import { getMemberPortalContext } from '@/features/application/queries/member-portal';
import { MemberRenewalPanel } from '@/features/payments/components/member-renewal-panel';
import { getLatestMemberRenewalRequest, getMemberActiveRenewalIntent } from '@/features/payments/queries/daraja';

import type {ApplicationStatus} from '@/prisma/src/generated/prisma/client';


function StatusBadge({status}: { status: 'DRAFT' | 'PENDING' | 'ACTIVE' | 'REJECTED' }) {

    const styles =

        status === 'ACTIVE'

            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'

            : status === 'REJECTED'

                ? 'border-rose-200 bg-rose-50 text-rose-700'

                : status === 'DRAFT'

                    ? 'border-slate-200 bg-slate-50 text-slate-700'

                    : 'border-amber-200 bg-amber-50 text-amber-700';


    return <Badge variant="outline" className={`px-3 py-1 text-[11px] font-semibold tracking-[0.12em] ${styles}`}>{status}</Badge>;

}


function formatDateTime(value: Date | null | undefined) {

    if (!value) return 'Not recorded';

    return value.toLocaleString();

}


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


function buildQueryString(
    current: Record<string, string | string[]>,
    updates: Record<string, string | string[] | number | null | undefined>,
) {

    const params = new URLSearchParams();


    for (const [key, value] of Object.entries(current)) {

        if (Array.isArray(value)) {

            for (const item of value) {

                if (item) params.append(key, item);

            }

        } else if (value) {

            params.set(key, value);

        }

    }


    for (const [key, value] of Object.entries(updates)) {

        params.delete(key);


        if (value === null || value === undefined || value === '') {

            continue;

        }


        if (Array.isArray(value)) {

            for (const item of value) {

                if (item) params.append(key, item);

            }

            continue;

        }


        params.set(key, String(value));

    }


    const queryString = params.toString();

    return queryString.length > 0 ? `/dashboard?${queryString}` : '/dashboard';

}


function PageNumberLink({

                            page,

                            currentPage,

                            currentParams,

                        }: {

    page: number;

    currentPage: number;

    currentParams: Record<string, string | string[]>;

}) {

    const active = page === currentPage;


    return (

        <Link

            href={buildQueryString(currentParams, {page})}

            className={`inline-flex h-10 min-w-10 items-center justify-center rounded-xl border px-3 text-sm font-medium ${active ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}

        >

            {page}

        </Link>

    );

}


function getVisiblePages(currentPage: number, totalPages: number) {

    const start = Math.max(1, currentPage - 2);

    const end = Math.min(totalPages, currentPage + 2);

    return Array.from({length: end - start + 1}, (_, index) => start + index);

}

function MetricLabel({
    label,
    hint,
}: {
    label: string;
    hint: string;
}) {
    return (
        <div className="flex items-center gap-1.5">
            <p className="portal-kicker text-slate-500">{label}</p>
            <span
                title={hint}
                aria-label={hint}
                className="inline-flex h-4 w-4 items-center justify-center rounded-full text-slate-400 transition hover:text-slate-600"
            >
                <CircleHelp className="h-3.5 w-3.5" />
            </span>
        </div>
    );
}


const savedViews: { id: AdminApplicationView; label: string; description: string }[] = [

    {id: 'all', label: 'All applications', description: 'Show the full queue'},

    {id: 'pending_only', label: 'Pending only', description: 'Applications awaiting first review'},

    {
        id: 'rejected_payment_issue',
        label: 'Rejected with payment issue',
        description: 'Rejected records flagged for payment proof or declaration issues'
    },

    {id: 'needs_correction', label: 'Needs correction', description: 'Rejected applications with reviewer flags'},

];


const exportPresets: { id: AdminApplicationView; label: string }[] = [

    {id: 'pending_only', label: 'Export pending queue'},

    {id: 'rejected_payment_issue', label: 'Export payment issues'},

    {id: 'needs_correction', label: 'Export needs correction'},

];


export default async function DashboardPage({

                                                searchParams,

                                            }: {

    searchParams?: Promise<Record<string, string | string[] | undefined>>;

}) {

    const session = await auth();


    if (!session?.user) {

        redirect('/auth/login');

    }


    const isAdmin = session.user.role === 'ADMIN';


    if (isAdmin) {

        const resolvedSearchParams = (await searchParams) ?? {};

        const currentParams: Record<string, string | string[]> = {};

        for (const [key, value] of Object.entries(resolvedSearchParams)) {

            if (typeof value === 'string' || Array.isArray(value)) {

                currentParams[key] = value;

            }

        }


        const query = normalizeSearchValue(resolvedSearchParams.q);

        const statuses = normalizeSearchValues(resolvedSearchParams.statuses) as ApplicationStatus[];

        const counties = normalizeSearchValues(resolvedSearchParams.counties);

        const categoryIds = normalizeSearchValues(resolvedSearchParams.categories);

        const view = (normalizeSearchValue(resolvedSearchParams.view) || 'all') as AdminApplicationView;

        const sortField = (normalizeSearchValue(resolvedSearchParams.sort) || 'updatedAt') as AdminApplicationSortField;

        const sortDirection = normalizeSearchValue(resolvedSearchParams.direction) === 'asc' ? 'asc' : 'desc';

        const page = Number.isFinite(Number(normalizeSearchValue(resolvedSearchParams.page))) ? Math.max(1, Number(normalizeSearchValue(resolvedSearchParams.page))) : 1;

        const pageSize = Number.isFinite(Number(normalizeSearchValue(resolvedSearchParams.pageSize))) ? Math.max(5, Number(normalizeSearchValue(resolvedSearchParams.pageSize))) : 10;


        const [counts, countyReport, categoryReport, operationalAnalytics, categories, table, notifications, branding] = await Promise.all([

            getApplicationCounts(),

            getCountyMembershipReport(),

            getCategoryMembershipReport(),

            getOperationalAnalytics(),

            getMembershipCategories(),

            getAdminApplicationTable({

                page,

                pageSize,

                query,

                statuses,

                counties,

                categoryIds,

                sortField,

                sortDirection,

                view,

            }),

            getHeaderNotifications(true, session.user.id),
            getPortalBranding(),

        ]);


        const visiblePages = getVisiblePages(table.page, table.totalPages);
        const hasApplications = table.totalCount > 0;
        const hasCategoryData = categoryReport.rows.length > 0;
        const hasCountyData = countyReport.rows.length > 0;
        const hasOperationalData = operationalAnalytics.reviewedCount > 0 || operationalAnalytics.rejectionReasons.length > 0 || operationalAnalytics.mostResubmitted.length > 0;


        return (

            <AppShell

                currentPath="/dashboard"

                isAdmin

                heading="Admin dashboard"

                description="Review applications and monitor operations."
                organizationName={branding.organizationName}
                organizationShortName={branding.organizationShortName}

                pageActions={
                    <>
                        <Link
                            href="/dashboard/settings"
                            className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                            Open settings
                        </Link>
                    </>
                }

            >

                <Card className="portal-surface-panel rounded-[28px] border-[color:var(--border-soft)] shadow-none">
                    <CardContent className="p-4 sm:p-6">
                        <div className="grid gap-5 [&>*]:min-w-0 xl:grid-cols-[1.45fr_0.95fr] xl:items-start">
                            <div className="min-w-0">
                                <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-600">
                                    Operations overview
                                </Badge>
                                <h2 className="portal-page-title mt-3">Operations overview</h2>
                                <p className="mt-3 max-w-2xl text-[14px] leading-7 text-slate-600">
                                    Review the queue, payment follow-up, and reporting from one page.
                                </p>
                                <Separator className="my-4 bg-[var(--border-soft)]" />
                                <div className="flex flex-wrap gap-2">
                                    {counts.pending > 0 ? (
                                        <Badge variant="outline" className="rounded-full border-amber-200 bg-amber-50 text-[11px] font-medium text-amber-700">
                                            {counts.pending} pending review
                                        </Badge>
                                    ) : null}
                                    {counts.active > 0 ? (
                                        <Badge variant="outline" className="rounded-full border-emerald-200 bg-emerald-50 text-[11px] font-medium text-emerald-700">
                                            {counts.active} active members
                                        </Badge>
                                    ) : null}
                                    {operationalAnalytics.reviewedCount > 0 ? (
                                        <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-600">
                                            {operationalAnalytics.reviewedCount} reviewed decisions
                                        </Badge>
                                    ) : null}
                                </div>
                            </div>
                            {hasApplications ? (
                                <div className="grid gap-3 [&>*]:min-w-0 sm:grid-cols-3 xl:grid-cols-1">
                                    <Card className="portal-surface-muted rounded-2xl border-[color:var(--border-soft)] shadow-none">
                                        <CardContent className="px-4 py-4">
                                            <MetricLabel label="Awaiting review" hint="Applications still pending first action from the admin team." />
                                            <p className="mt-2 text-lg font-medium text-slate-950">{counts.pending}</p>
                                            <p className="mt-1 text-xs text-slate-500">Applications still pending first action.</p>
                                        </CardContent>
                                    </Card>
                                    <Card className="portal-surface-muted rounded-2xl border-[color:var(--border-soft)] shadow-none">
                                        <CardContent className="px-4 py-4">
                                            <MetricLabel label="Reviewed volume" hint="Applications that already received an approval or rejection decision." />
                                            <p className="mt-2 text-lg font-medium text-slate-950">{operationalAnalytics.reviewedCount}</p>
                                            <p className="mt-1 text-xs text-slate-500">Completed approval or rejection decisions.</p>
                                        </CardContent>
                                    </Card>
                                    <Card className="portal-surface-muted rounded-2xl border-[color:var(--border-soft)] shadow-none">
                                        <CardContent className="px-4 py-4">
                                            <MetricLabel label="Avg turnaround" hint="Average time from submission to recorded review decision." />
                                            <p className="mt-2 text-lg font-medium text-slate-950">{operationalAnalytics.averageDecisionHours}h</p>
                                            <p className="mt-1 text-xs text-slate-500">Average time from submission to decision.</p>
                                        </CardContent>
                                    </Card>
                                </div>
                            ) : (
                                <Card className="portal-surface-muted rounded-2xl border-[color:var(--border-soft)] shadow-none">
                                    <CardContent className="px-5 py-5">
                                        <p className="portal-kicker">Current status</p>
                                        <p className="mt-2 text-base font-medium text-slate-950">No submitted applications yet</p>
                                        <p className="mt-2 text-sm leading-6 text-slate-600">Once applications start coming in, this dashboard will surface queue pressure, review turnaround, and county and category reporting here.</p>
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {(counts.pending > 0 || counts.active > 0 || counts.rejected > 0) ? (
                    <section className="grid gap-3 [&>*]:min-w-0 md:grid-cols-3">
                        {counts.pending > 0 ? (
                            <Card className="portal-surface-card rounded-2xl border-[color:var(--border-soft)] shadow-none">
                                <CardContent className="px-4 py-4 sm:px-5">
                                    <div className="flex items-center justify-between gap-3">
                                        <MetricLabel label="Pending applications" hint="Applications waiting for first review or payment confirmation." />
                                        <span className="h-2 w-2 rounded-full bg-amber-500/70" />
                                    </div>
                                    <p className="mt-3 text-[22px] font-medium text-slate-950 sm:text-[24px]">{counts.pending}</p>
                                    <p className="mt-1 text-sm text-slate-500">Waiting for first review or payment confirmation.</p>
                                </CardContent>
                            </Card>
                        ) : null}

                        {counts.active > 0 ? (
                            <Card className="portal-surface-card rounded-2xl border-[color:var(--border-soft)] shadow-none">
                                <CardContent className="px-4 py-4 sm:px-5">
                                    <div className="flex items-center justify-between gap-3">
                                        <MetricLabel label="Active members" hint="Approved application records that now have live member access." />
                                        <span className="h-2 w-2 rounded-full bg-emerald-500/70" />
                                    </div>
                                    <p className="mt-3 text-[22px] font-medium text-slate-950 sm:text-[24px]">{counts.active}</p>
                                    <p className="mt-1 text-sm text-slate-500">Approved records with live member access.</p>
                                </CardContent>
                            </Card>
                        ) : null}

                        {counts.rejected > 0 ? (
                            <Card className="portal-surface-card rounded-2xl border-[color:var(--border-soft)] shadow-none">
                                <CardContent className="px-4 py-4 sm:px-5">
                                    <div className="flex items-center justify-between gap-3">
                                        <MetricLabel label="Rejected applications" hint="Applications returned for correction before resubmission." />
                                        <span className="h-2 w-2 rounded-full bg-rose-500/70" />
                                    </div>
                                    <p className="mt-3 text-[22px] font-medium text-slate-950 sm:text-[24px]">{counts.rejected}</p>
                                    <p className="mt-1 text-sm text-slate-500">Returned for correction before resubmission.</p>
                                </CardContent>
                            </Card>
                        ) : null}
                    </section>
                ) : null}


                <section className="grid gap-5 [&>*]:min-w-0 xl:grid-cols-[minmax(0,1.02fr)_minmax(0,1.18fr)]">

                    <Card className="portal-surface-panel rounded-3xl border-[color:var(--border-soft)] shadow-none">
                        <CardHeader className="p-5 pb-4 sm:p-6 sm:pb-4">
                            <div>
                                <CardTitle className="text-lg font-medium text-slate-950">Review operations</CardTitle>
                                <CardDescription className="mt-1 max-w-sm">Reviewer throughput and turnaround.</CardDescription>
                            </div>
                        </CardHeader>

                        <CardContent className="space-y-5 p-5 pt-0 sm:p-6 sm:pt-0">
                            <div className="grid gap-3 md:grid-cols-2">
                                <Card className="rounded-2xl border-[color:var(--border-soft)] bg-white shadow-none">
                                    <CardContent className="p-5">
                                        <MetricLabel label="Reviewed" hint="Applications that already received a completed approval or rejection decision." />
                                        <p className="mt-3 text-3xl font-medium tracking-tight text-slate-950">{operationalAnalytics.reviewedCount}</p>
                                        <p className="mt-2 text-sm text-slate-500">Completed decisions.</p>
                                    </CardContent>
                                </Card>

                                <Card className="rounded-2xl border-[color:var(--border-soft)] bg-white shadow-none">
                                    <CardContent className="p-5">
                                        <MetricLabel label="Average turnaround" hint="The average time between application submission and the recorded review decision." />
                                        <p className="mt-3 text-3xl font-medium tracking-tight text-slate-950">{operationalAnalytics.averageDecisionHours}h</p>
                                        <p className="mt-2 text-sm text-slate-500">Submission to decision.</p>
                                    </CardContent>
                                </Card>

                                <Card className="rounded-2xl border-[color:var(--border-soft)] bg-white shadow-none">
                                    <CardContent className="p-5">
                                        <MetricLabel label="Median turnaround" hint="The middle turnaround value, which is often more stable than the average when outliers exist." />
                                        <p className="mt-3 text-3xl font-medium tracking-tight text-slate-950">{operationalAnalytics.medianDecisionHours}h</p>
                                        <p className="mt-2 text-sm text-slate-500">Middle reviewed record.</p>
                                    </CardContent>
                                </Card>

                                <Card className="rounded-2xl border-[color:var(--border-soft)] bg-white shadow-none">
                                    <CardContent className="p-5">
                                        <MetricLabel label="With resubmission" hint="Applications that came back for at least one revision cycle before the current review state." />
                                        <p className="mt-3 text-3xl font-medium tracking-tight text-slate-950">{operationalAnalytics.applicationsWithResubmissions}</p>
                                        <p className="mt-2 text-sm text-slate-500">{operationalAnalytics.totalResubmissions} total revision cycle{operationalAnalytics.totalResubmissions === 1 ? '' : 's'}.</p>
                                    </CardContent>
                                </Card>
                            </div>

                            <Separator className="bg-[var(--border-soft)]" />

                            <div className="overflow-hidden rounded-2xl border border-[color:var(--border-soft)] bg-[var(--surface-elevated)]">
                                <ScrollArea className="w-full">
                                    <div className="min-w-[520px]">
                                        <Table>
                                            <TableHeader className="bg-slate-50/85">
                                                <TableRow className="hover:bg-transparent">
                                                    <TableHead>Reviewer</TableHead>
                                                    <TableHead className="text-right">Reviewed</TableHead>
                                                    <TableHead className="text-right">Approved</TableHead>
                                                    <TableHead className="text-right">Rejected</TableHead>
                                                    <TableHead className="text-right">Avg turnaround</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {operationalAnalytics.reviewerWorkload.length === 0 ? (
                                                    <TableRow>
                                                        <TableCell colSpan={5} className="py-8 text-sm text-slate-500">Reviewer metrics will appear after the first completed reviews.</TableCell>
                                                    </TableRow>
                                                ) : (
                                                    operationalAnalytics.reviewerWorkload.map((reviewer) => (
                                                        <TableRow key={reviewer.reviewerId}>
                                                            <TableCell className="font-medium text-slate-900">{reviewer.reviewerName}</TableCell>
                                                            <TableCell className="text-right tabular-nums">{reviewer.reviewedCount}</TableCell>
                                                            <TableCell className="text-right tabular-nums">{reviewer.approvedCount}</TableCell>
                                                            <TableCell className="text-right tabular-nums">{reviewer.rejectedCount}</TableCell>
                                                            <TableCell className="text-right tabular-nums">{reviewer.averageDecisionHours}h</TableCell>
                                                        </TableRow>
                                                    ))
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>
                                    <ScrollBar orientation="horizontal" />
                                </ScrollArea>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="space-y-5">
                        <Card className="portal-surface-panel rounded-3xl border-[color:var(--border-soft)] shadow-none">
                            <CardHeader className="p-5 pb-4 sm:p-6 sm:pb-4">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                                    <div>
                                        <CardTitle className="text-lg font-medium text-slate-950">Rejection reasons</CardTitle>
                                        <CardDescription className="mt-1 max-w-sm">Most common rejection causes.</CardDescription>
                                    </div>
                                    {hasOperationalData ? <Badge variant="outline" className="w-fit rounded-full border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-600">Top 5 reasons</Badge> : null}
                                </div>
                            </CardHeader>

                            <CardContent className="p-5 pt-0 sm:p-6 sm:pt-0">
                                {operationalAnalytics.rejectionReasons.length === 0 ? (
                                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-5 py-8 text-sm text-slate-500">
                                        No rejection analysis yet.
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {operationalAnalytics.rejectionReasons.slice(0, 5).map((reason, index) => (
                                            <Card key={reason.reason} className="rounded-2xl border-[color:var(--border-soft)] bg-white shadow-none">
                                                <CardContent className="flex items-start gap-4 p-4 sm:items-center sm:justify-between">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-slate-400">
                                                            <span>{String(index + 1).padStart(2, '0')}</span>
                                                            <span className="h-px flex-1 bg-slate-200" />
                                                        </div>
                                                        <p className="mt-2 text-sm leading-6 text-slate-700">{reason.reason}</p>
                                                    </div>
                                                    <Badge variant="outline" className="shrink-0 rounded-full border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-600">{reason.count}</Badge>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <Card className="portal-surface-panel rounded-3xl border-[color:var(--border-soft)] shadow-none">
                            <CardHeader className="p-5 pb-4 sm:p-6 sm:pb-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <CardTitle className="text-lg font-medium text-slate-950">Resubmission trends</CardTitle>
                                        <CardDescription className="mt-1 max-w-sm">Revision frequency and repeat cycles.</CardDescription>
                                    </div>
                                    {operationalAnalytics.totalResubmissions > 0 ? (
                                        <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-600">
                                            {operationalAnalytics.totalResubmissions} total
                                        </Badge>
                                    ) : null}
                                </div>
                            </CardHeader>

                            <CardContent className="space-y-5 p-5 pt-0 sm:p-6 sm:pt-0">
                                <div className="grid gap-3 sm:grid-cols-3">
                                    {operationalAnalytics.resubmissionBuckets.map((bucket) => (
                                        <Card key={bucket.label} className="rounded-2xl border-[color:var(--border-soft)] bg-white shadow-none">
                                            <CardContent className="p-5">
                                                <p className="portal-kicker text-slate-500">{bucket.label}</p>
                                                <p className="mt-3 text-3xl font-medium tracking-tight text-slate-950">{bucket.count}</p>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>

                                <div className="overflow-hidden rounded-2xl border border-[color:var(--border-soft)] bg-[var(--surface-elevated)]">
                                    <ScrollArea className="w-full">
                                        <div className="min-w-[460px]">
                                            <Table>
                                                <TableHeader className="bg-slate-50/85">
                                                    <TableRow className="hover:bg-transparent">
                                                        <TableHead>Applicant</TableHead>
                                                        <TableHead>Status</TableHead>
                                                        <TableHead className="text-right">Resubmissions</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {operationalAnalytics.mostResubmitted.length === 0 ? (
                                                        <TableRow>
                                                            <TableCell colSpan={3} className="py-8 text-sm text-slate-500">No resubmitted applications yet.</TableCell>
                                                        </TableRow>
                                                    ) : (
                                                        operationalAnalytics.mostResubmitted.map((application) => (
                                                            <TableRow key={application.id}>
                                                                <TableCell className="py-3.5">
                                                                    <p className="font-medium text-slate-900">{application.applicantName}</p>
                                                                    <p className="text-xs text-slate-500">{application.email}</p>
                                                                </TableCell>
                                                                <TableCell className="py-3.5"><StatusBadge status={application.status}/></TableCell>
                                                                <TableCell className="py-3.5 text-right tabular-nums text-slate-700">{application.resubmissionCount}</TableCell>
                                                            </TableRow>
                                                        ))
                                                    )}
                                                </TableBody>
                                            </Table>
                                        </div>
                                        <ScrollBar orientation="horizontal" />
                                    </ScrollArea>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </section>

                <Card className="portal-surface-panel rounded-3xl border-[color:var(--border-soft)] shadow-none">

                    <CardHeader className="p-5 pb-4 sm:p-6 sm:pb-4">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">

                            <div>

                                <CardTitle className="text-lg font-medium text-slate-950">Applications queue</CardTitle>

                                <CardDescription className="mt-1 max-w-sm">Search and manage the review queue.</CardDescription>

                            </div>

                            <div className="flex flex-col items-start gap-2 lg:items-end">

                                <div className="text-sm text-slate-500">

                                    Showing {table.items.length} of {table.totalCount} application{table.totalCount === 1 ? '' : 's'}

                                </div>

                                {hasApplications ? (
                                    <DropdownMenu>
                                        <DropdownMenuTrigger className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                                            Export options
                                            <MoreHorizontal className="h-4 w-4" />
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem asChild>
                                                <Link href={buildQueryString(currentParams, {}).replace('/dashboard', '/dashboard/export')}>Export current queue</Link>
                                            </DropdownMenuItem>
                                            {exportPresets.map((preset) => (
                                                <DropdownMenuItem key={preset.id} asChild>
                                                    <Link href={buildQueryString({...currentParams, view: preset.id}, {}).replace('/dashboard', '/dashboard/export')}>
                                                        {preset.label}
                                                    </Link>
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                ) : null}

                            </div>

                        </div>
                    </CardHeader>

                    <CardContent className="space-y-5 p-5 pt-0 sm:p-6 sm:pt-0">
                        <div className="flex flex-wrap gap-2">

                            {savedViews.map((savedView) => {

                                const active = table.view === savedView.id;

                                return (

                                    <Link

                                        key={savedView.id}

                                        href={buildQueryString(currentParams, {
                                            view: savedView.id === 'all' ? null : savedView.id,
                                            page: 1
                                        })}

                                        className={`inline-flex rounded-full border px-3.5 py-1.5 text-sm font-medium ${active ? 'border-slate-300 bg-slate-100 text-slate-900' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800'}`}

                                        title={savedView.description}

                                    >

                                        {savedView.label}

                                    </Link>

                                );

                            })}

                        </div>

                        <Separator className="bg-[var(--border-soft)]" />

                        {(query || statuses.length > 0 || counties.length > 0 || categoryIds.length > 0 || pageSize !== 10) ? (
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-[11px] font-medium text-slate-600">
                                    Active filters
                                </Badge>
                                {query ? (
                                    <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-600">
                                        Search: {query}
                                    </Badge>
                                ) : null}
                                {statuses.length > 0 ? (
                                    <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-600">
                                        {statuses.length} status{statuses.length === 1 ? '' : 'es'}
                                    </Badge>
                                ) : null}
                                {counties.length > 0 ? (
                                    <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-600">
                                        {counties.length} count{counties.length === 1 ? 'y' : 'ies'}
                                    </Badge>
                                ) : null}
                                {categoryIds.length > 0 ? (
                                    <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-600">
                                        {categoryIds.length} categor{categoryIds.length === 1 ? 'y' : 'ies'}
                                    </Badge>
                                ) : null}
                                {pageSize !== 10 ? (
                                    <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-600">
                                        {pageSize} rows
                                    </Badge>
                                ) : null}
                            </div>
                        ) : null}

                        <DashboardQueueFilters
                            query={query}
                            statuses={statuses}
                            counties={counties}
                            categoryIds={categoryIds}
                            pageSize={pageSize}
                            sortField={sortField}
                            sortDirection={sortDirection}
                            view={view}
                            countyOptions={countyReport.rows.map((row) => ({
                                value: row.county,
                                label: row.county,
                            }))}
                            categoryOptions={categories.map((category) => ({
                                value: category.id,
                                label: category.name,
                            }))}
                        />

                        <AdminApplicationsDataTable
                            rows={table.items.map((application) => ({
                                id: application.id,
                                firstName: application.firstName,
                                surname: application.surname,
                                email: application.email,
                                idNumber: application.idNumber,
                                phoneNumber: application.phoneNumber,
                                status: application.status,
                                membershipCategory: application.membershipCategory,
                                county: application.county,
                                paymentLabel: `${application.paymentMethod.replaceAll('_', ' ')} · ${application.transactionReferenceNumber ?? 'Pending confirmation'}`,
                                resubmissionCount: application.resubmissionCount,
                                updatedLabel: application.updatedAt.toLocaleDateString(),
                                reviewHref: `/dashboard/applications/${application.id}`,
                                paymentProofUrl: application.paymentProofUrl,
                                paymentProofHistory: application.paymentProofHistory,
                            }))}
                            currentParams={currentParams}
                            currentField={sortField}
                            currentDirection={sortDirection}
                        />

                        <Separator className="bg-[var(--border-soft)]" />

                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

                            <p className="text-sm text-slate-500">Page {table.page} of {table.totalPages}</p>

                            <div className="flex flex-wrap items-center gap-2">

                                <Link

                                    href={buildQueryString(currentParams, {page: Math.max(1, table.page - 1)})}

                                    className={`inline-flex rounded-xl border px-4 py-2 text-sm font-medium ${table.page <= 1 ? 'pointer-events-none border-slate-100 text-slate-300' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}

                                >

                                    Previous

                                </Link>

                                {visiblePages[0] > 1 ? <PageNumberLink page={1} currentPage={table.page} currentParams={currentParams}/> : null}

                                {visiblePages[0] > 2 ? <span className="px-2 text-sm text-slate-400">...</span> : null}

                                {visiblePages.map((visiblePage) => (

                                    <PageNumberLink key={visiblePage} page={visiblePage} currentPage={table.page} currentParams={currentParams}/>

                                ))}

                                {visiblePages[visiblePages.length - 1] < table.totalPages - 1 ? <span className="px-2 text-sm text-slate-400">...</span> : null}

                                {visiblePages[visiblePages.length - 1] < table.totalPages ? <PageNumberLink page={table.totalPages} currentPage={table.page} currentParams={currentParams}/> : null}

                                <Link

                                    href={buildQueryString(currentParams, {page: Math.min(table.totalPages, table.page + 1)})}

                                    className={`inline-flex rounded-xl border px-4 py-2 text-sm font-medium ${table.page >= table.totalPages ? 'pointer-events-none border-slate-100 text-slate-300' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}

                                >

                                    Next

                                </Link>

                            </div>

                        </div>
                    </CardContent>

                </Card>
            </AppShell>

        );

    }


    const [memberPortal, applicantProfile, renewalIntent, latestRenewalRequest] = await Promise.all([
        getMemberPortalContext(session.user.id),
        getApplicantProfileByUserId(session.user.id),
        getMemberActiveRenewalIntent(session.user.id),
        getLatestMemberRenewalRequest(session.user.id),
    ]);

    const { application, policy, portalSetting } = memberPortal;
    const onboardingPath = resolveMemberOnboardingPath(application, applicantProfile);
    const currentRenewalIntent = renewalIntent ? {
        status: renewalIntent.status,
        payerPhoneNumber: renewalIntent.payerPhoneNumber,
        totalAmount: renewalIntent.totalAmount,
        currency: renewalIntent.currency,
        billingYear: renewalIntent.billingYear,
        checkoutRequestId: renewalIntent.checkoutRequestId,
        receiptNumber: renewalIntent.mpesaReceiptNumber,
        lastError: renewalIntent.lastError,
    } : null;
    const currentRenewalRequest = latestRenewalRequest ? {
        status: latestRenewalRequest.status,
        phoneNumber: latestRenewalRequest.phoneNumber,
        amount: latestRenewalRequest.amount,
        updatedAt: latestRenewalRequest.updatedAt.toISOString(),
        checkoutRequestId: latestRenewalRequest.checkoutRequestId,
        receiptNumber: latestRenewalRequest.mpesaReceiptNumber,
        resultDesc: latestRenewalRequest.resultDesc,
    } : null;


    if (onboardingPath !== '/dashboard') {

        redirect(onboardingPath);

    }


    const reviseAction = reviseRejectedApplication;
    const memberApplication = application!;

    const isActiveMember = memberApplication.status === 'ACTIVE';


    return (

        <AppShell

            currentPath="/dashboard"

            heading={isActiveMember ? 'Member portal' : 'Application status'}

            description={

                isActiveMember

                    ? 'Use the member portal for your membership status, documents, and payments.'

                    : 'Track the review status of your membership application and return to the form if the application is rejected.'

            }
            canAccessApplicationForm={policy.canAccessApplicationForm}
            canViewCertificate={policy.canViewCertificate}
            canViewMembershipCard={policy.canViewMembershipCard}
            accountState={policy.membershipStateLabel}
            organizationName={portalSetting?.setupName ?? 'IGANO Professional Development Association'}
            organizationShortName={portalSetting?.shortName ?? 'IGPDA'}

        >

            <div className="flex items-center gap-3">

                <StatusBadge status={memberApplication.status}/>

                <p className="text-sm text-slate-600">Submitted on {memberApplication.createdAt.toLocaleDateString()} with
                    reference {memberApplication.transactionReferenceNumber ?? 'Pending confirmation'}.</p>

            </div>


            {memberApplication.status === 'ACTIVE' ? (

                <div className="space-y-6">

                    <section className="grid gap-4 md:grid-cols-3">

                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">

                            <p className="text-sm font-medium text-emerald-700">Membership status</p>

                            <p className="mt-2 text-2xl font-semibold text-slate-950">{policy.membershipStateLabel}</p>

                        </div>

                        <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-soft)] p-5">

                            <p className="text-sm font-medium text-[var(--brand)]">Membership ID</p>

                            <p className="mt-2 text-2xl font-semibold text-slate-950">{memberApplication.membershipNumber ?? 'Pending assignment'}</p>

                        </div>

                        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">

                            <p className="text-sm font-medium text-slate-500">Renewal</p>

                            <p className="mt-2 text-xl font-semibold text-slate-950">{policy.membershipStateLabel}</p>

                            <p className="mt-1 text-sm text-slate-600">{policy.renewalDue ? policy.renewalSummary : policy.daysRemaining !== null ? `${policy.daysRemaining} day${policy.daysRemaining === 1 ? '' : 's'} remaining` : policy.renewalSummary}</p>

                        </div>

                    </section>


                    <MemberRenewalPanel
                        renewalsEnabled={policy.renewalsEnabled}
                        renewalMode={policy.renewalMode}
                        renewalDue={policy.renewalDue}
                        renewalInGracePeriod={policy.renewalInGracePeriod}
                        renewalReminderWindowOpen={policy.renewalReminderWindowOpen}
                        membershipStateLabel={policy.membershipStateLabel}
                        currentRenewalYear={policy.currentRenewalYear}
                        coverageStartsAt={policy.coverageStartsAt ? policy.coverageStartsAt.toISOString() : null}
                        coverageEndsAt={policy.coverageEndsAt ? policy.coverageEndsAt.toISOString() : null}
                        graceEndsAt={policy.graceEndsAt ? policy.graceEndsAt.toISOString() : null}
                        daysRemaining={policy.daysRemaining}
                        renewalReminderLeadDays={policy.renewalReminderLeadDays}
                        renewalReminderFrequency={policy.renewalReminderFrequency}
                        annualRenewalFee={portalSetting?.annualRenewalFee ?? 0}
                        taxAmount={portalSetting?.isTaxEnabled ? Math.round(((portalSetting?.annualRenewalFee ?? 0) * (portalSetting?.taxPercentage ?? 0)) / 100) : 0}
                        totalAmount={(portalSetting?.annualRenewalFee ?? 0) + (portalSetting?.isTaxEnabled ? Math.round(((portalSetting?.annualRenewalFee ?? 0) * (portalSetting?.taxPercentage ?? 0)) / 100) : 0)}
                        currency={portalSetting?.currency ?? memberApplication.currency ?? 'KES'}
                        currentIntent={currentRenewalIntent}
                        latestRequest={currentRenewalRequest}
                    />

                    <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">

                        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">

                            <h3 className="text-lg font-semibold text-slate-950">Member overview</h3>

                            <p className="mt-2 text-sm leading-6 text-slate-600">
                                Your application is approved and this is now your main member workspace.
                            </p>


                            <div className="mt-6 grid gap-4 sm:grid-cols-2">

                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">

                                    <p className="text-[11px] font-medium tracking-[0.12em] text-slate-500">Primary contact</p>

                                    <p className="mt-2 text-sm font-medium text-slate-900">{memberApplication.email}</p>

                                    <p className="mt-1 text-sm text-slate-600">{memberApplication.phoneNumber}</p>

                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">

                                    <p className="text-[11px] font-medium tracking-[0.12em] text-slate-500">Approved on</p>

                                    <p className="mt-2 text-sm font-medium text-slate-900">{formatDateTime(memberApplication.reviewedAt)}</p>

                                    <p className="mt-1 text-sm text-slate-600">Reviewed by {memberApplication.reviewedBy?.name ?? memberApplication.reviewedBy?.email ?? 'the admin team'}</p>

                                </div>

                            </div>

                        </div>


                        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">

                            <h3 className="text-lg font-semibold text-slate-950">Available now</h3>

                            <div className="mt-4 space-y-3 text-sm text-slate-600">

                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">

                                    <p className="font-medium text-slate-900">Profile</p>

                                    <p className="mt-1">Keep your contact and professional details current from your profile page.</p>

                                    <Link href="/profile" className="mt-3 inline-flex font-medium text-[var(--brand)] hover:underline">
                                        Open profile
                                    </Link>

                                </div>

                                {policy.canViewCertificate ? (
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">

                                        <p className="font-medium text-slate-900">Certificate</p>

                                        <p className="mt-1">Your certificate is currently visible in the member portal.</p>

                                        <Link href="/dashboard/certificate" className="mt-3 inline-flex font-medium text-[var(--brand)] hover:underline">
                                            Open certificate
                                        </Link>

                                    </div>
                                ) : null}

                                {policy.canViewMembershipCard ? (
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">

                                        <p className="font-medium text-slate-900">Membership card</p>

                                        <p className="mt-1">Your membership card is currently visible in the member portal.</p>

                                        <Link href="/dashboard/card" className="mt-3 inline-flex font-medium text-[var(--brand)] hover:underline">
                                            Open membership card
                                        </Link>

                                    </div>
                                ) : null}

                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">

                                    <p className="font-medium text-slate-900">Payments</p>

                                    <p className="mt-1">Review your recorded payments and renewal status.</p>

                                    <Link href="/dashboard/payments" className="mt-3 inline-flex font-medium text-[var(--brand)] hover:underline">
                                        Open payment history
                                    </Link>

                                </div>

                                {!policy.canViewCertificate || !policy.canViewMembershipCard ? (
                                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                                        <p className="font-medium text-amber-800">Document access</p>
                                        <p className="mt-1 text-amber-700">{policy.renewalSummary}</p>
                                    </div>
                                ) : null}

                            </div>

                        </div>

                    </section>

                </div>

            ) : null}

            {memberApplication.status !== 'ACTIVE' ? (

                <div
                    className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-700 shadow-[0_10px_32px_rgba(15,23,42,0.05)]">

                    {memberApplication.status === 'PENDING' ?
                        <p>Your application is pending manual verification. An administrator still needs to confirm your
                            payment proof before member access is enabled.</p> : null}

                    {memberApplication.status === 'REJECTED' ? (

                        <div className="space-y-4">

                            <p className="text-base font-semibold text-slate-950">Your application was reviewed and
                                needs revision before resubmission.</p>

                            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">

                                <p className="font-medium">Reason: {memberApplication.rejectionReason ?? 'No reason was recorded.'}</p>

                            </div>

                            {memberApplication.reviewNotes ? (

                                <div
                                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">

                                    <p className="font-medium text-slate-900">Reviewer notes</p>

                                    <p className="mt-2">{memberApplication.reviewNotes}</p>

                                </div>

                            ) : null}

                            <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2">

                                <p>Rejected at: {formatDateTime(memberApplication.rejectedAt)}</p>

                                <p>Last resubmitted: {formatDateTime(memberApplication.resubmittedAt)}</p>

                                <p>Resubmissions so far: {memberApplication.resubmissionCount}</p>

                                <p>Current payment proof: {memberApplication.paymentProofOriginalName ?? 'Not recorded'}</p>

                            </div>

                            {memberApplication.flaggedSections.length > 0 ? (

                                <div className="space-y-2">

                                    <p className="text-sm font-medium text-slate-900">Sections marked for revision</p>

                                    <div className="flex flex-wrap gap-2">

                                        {memberApplication.flaggedSections.map((sectionId) => (

                                            <span key={sectionId}
                                                  className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">

                        {getApplicationReviewSectionLabel(sectionId)}

                      </span>

                                        ))}

                                    </div>

                                </div>

                            ) : null}

                            {memberApplication.flaggedFields.length > 0 ? (

                                <div className="space-y-2">

                                    <p className="text-sm font-medium text-slate-900">Fields marked for correction</p>

                                    <div className="flex flex-wrap gap-2">

                                        {memberApplication.flaggedFields.map((fieldId) => (

                                            <span key={fieldId}
                                                  className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700">

                        {getApplicationReviewFieldLabel(fieldId)}

                      </span>

                                        ))}

                                    </div>

                                </div>

                            ) : null}

                            {memberApplication.paymentProofHistory.length > 0 ? (

                                <div className="space-y-2">

                                    <p className="text-sm font-medium text-slate-900">Archived payment proofs</p>

                                    <div className="flex flex-wrap gap-2">

                                        {memberApplication.paymentProofHistory.map((proof) => (

                                            <Link

                                                key={proof.id}

                                                href={proof.paymentProofUrl}

                                                target="_blank"

                                                className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"

                                            >

                                                {proof.paymentProofOriginalName} Â· {proof.archivedAt.toLocaleDateString()}

                                            </Link>

                                        ))}

                                    </div>

                                </div>

                            ) : null}

                            <p className="text-slate-600">Select revise to restore your previous answers into a draft,
                                update the flagged sections, and submit again.</p>

                            <form action={reviseAction}>

                                <button type="submit"
                                        className="inline-flex rounded-xl border border-[var(--brand)] bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90">

                                    Revise application

                                </button>

                            </form>

                        </div>

                    ) : null}

                </div>

            ) : null}

        </AppShell>

    );

}









