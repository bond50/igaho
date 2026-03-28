'use client';

import Link from 'next/link';
import {
    ChevronDown,
    ChevronRight,
    EllipsisVertical,
    ExternalLink,
    FolderOpenDot,
    Mail,
    Phone,
    RotateCcw,
    Search,
    ShieldCheck,
    Wallet,
} from 'lucide-react';
import type {ColumnDef, Row, Table as TanstackTable} from '@tanstack/react-table';

import {DataTable} from '@/components/ui/data-table';
import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {Input} from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

export type AdminApplicationsRow = {
    id: string;
    firstName: string;
    surname: string;
    email: string;
    idNumber: string;
    phoneNumber: string;
    status: 'DRAFT' | 'PENDING' | 'ACTIVE' | 'REJECTED';
    membershipCategory: string;
    county: string;
    paymentLabel: string;
    resubmissionCount: number;
    updatedLabel: string;
    reviewHref: string;
    paymentProofUrl: string | null;
    paymentProofHistory: Array<{ id: string; paymentProofUrl: string; paymentProofOriginalName: string }>;
};

type SortField = 'updatedAt' | 'createdAt' | 'surname' | 'county' | 'status' | 'resubmissionCount';

type Props = {
    rows: AdminApplicationsRow[];
    currentParams: Record<string, string | string[]>;
    currentField: SortField;
    currentDirection: 'asc' | 'desc';
};

function StatusBadge({status}: { status: AdminApplicationsRow['status'] }) {
    const styles =
        status === 'ACTIVE'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : status === 'REJECTED'
                ? 'border-rose-200 bg-rose-50 text-rose-700'
                : status === 'DRAFT'
                    ? 'border-slate-200 bg-slate-50 text-slate-700'
                    : 'border-amber-200 bg-amber-50 text-amber-700';

    return (
        <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold tracking-[0.12em] ${styles}`}>
            {status}
        </span>
    );
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

        if (value === null || value === undefined || value === '') continue;

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

function SortHeader({
    label,
    field,
    currentParams,
    currentField,
    currentDirection,
}: {
    label: string;
    field: SortField;
    currentParams: Record<string, string | string[]>;
    currentField: SortField;
    currentDirection: 'asc' | 'desc';
}) {
    const isActive = currentField === field;
    const nextDirection = isActive && currentDirection === 'asc' ? 'desc' : 'asc';
    const href = buildQueryString(currentParams, {sort: field, direction: nextDirection, page: 1});

    return (
        <Link href={href} scroll={false} className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-900">
            <span>{label}</span>
            {isActive ? <span className="text-[10px] uppercase tracking-[0.16em] text-slate-400">{currentDirection}</span> : null}
        </Link>
    );
}

function renderBulkActions(table: TanstackTable<AdminApplicationsRow>) {
    const selectedRows = table.getFilteredSelectedRowModel().rows;
    const selectedEmails = selectedRows.map((row) => row.original.email).join('; ');
    const selectedPhones = selectedRows.map((row) => row.original.phoneNumber).join('; ');
    const selectedLinks = selectedRows.map((row) => `${window.location.origin}${row.original.reviewHref}`).join('\n');
    const firstReviewHref = selectedRows[0]?.original.reviewHref;

    return (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
                <p className="text-sm font-medium text-slate-900">Bulk reviewer tools</p>
                <p className="text-sm text-slate-500">Use these actions to coordinate follow-up on the selected applications.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" className="rounded-xl" onClick={() => table.resetRowSelection()}>
                    <RotateCcw className="mr-2 h-4 w-4"/>
                    Clear selection
                </Button>
                <Button type="button" variant="outline" className="rounded-xl" onClick={() => navigator.clipboard.writeText(selectedEmails)}>
                    <Mail className="mr-2 h-4 w-4"/>
                    Copy emails
                </Button>
                <Button type="button" variant="outline" className="rounded-xl" onClick={() => navigator.clipboard.writeText(selectedPhones)}>
                    <Phone className="mr-2 h-4 w-4"/>
                    Copy phones
                </Button>
                <Button type="button" variant="outline" className="rounded-xl" onClick={() => navigator.clipboard.writeText(selectedLinks)}>
                    <FolderOpenDot className="mr-2 h-4 w-4"/>
                    Copy review links
                </Button>
                {firstReviewHref ? (
                    <Link
                        href={firstReviewHref}
                        className="inline-flex items-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                    >
                        <ShieldCheck className="mr-2 h-4 w-4"/>
                        Open first review
                    </Link>
                ) : null}
            </div>
        </div>
    );
}

function renderToolbar(table: TanstackTable<AdminApplicationsRow>) {
    const applicantFilter = (table.getColumn('applicant')?.getFilterValue() as string) ?? '';
    const statusFilter = (table.getColumn('status')?.getFilterValue() as string) ?? 'all';
    const countyFilter = (table.getColumn('county')?.getFilterValue() as string) ?? 'all';

    const countyValues = Array.from(
        new Set(table.getCoreRowModel().rows.map((row) => row.original.county).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b));

    return (
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(18rem,24rem)_11rem_12rem]">
                <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/>
                    <Input
                        value={applicantFilter}
                        onChange={(event) => table.getColumn('applicant')?.setFilterValue(event.target.value)}
                        placeholder="Quick filter by applicant, email, ID, or phone"
                        className="pl-9"
                    />
                </div>
                <Select
                    value={statusFilter}
                    onValueChange={(value: string) => table.getColumn('status')?.setFilterValue(value === 'all' ? '' : value)}
                >
                    <SelectTrigger className="h-11 w-full rounded-xl">
                        <SelectValue placeholder="All statuses"/>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="PENDING">Pending</SelectItem>
                        <SelectItem value="ACTIVE">Active</SelectItem>
                        <SelectItem value="REJECTED">Rejected</SelectItem>
                        <SelectItem value="DRAFT">Draft</SelectItem>
                    </SelectContent>
                </Select>
                <Select
                    value={countyFilter}
                    onValueChange={(value: string) => table.getColumn('county')?.setFilterValue(value === 'all' ? '' : value)}
                >
                    <SelectTrigger className="h-11 w-full rounded-xl">
                        <SelectValue placeholder="All counties"/>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All counties</SelectItem>
                        {countyValues.map((county) => (
                            <SelectItem key={county} value={county}>{county}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="text-xs text-slate-400">
                Column visibility is saved on this device. Quick filters work inside the current page of results.
            </div>
        </div>
    );
}

function renderExpandedContent(row: Row<AdminApplicationsRow>) {
    const application = row.original;

    return (
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr]">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Applicant contact</p>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                    <p><span className="font-medium text-slate-900">Email:</span> {application.email}</p>
                    <p><span className="font-medium text-slate-900">Phone:</span> {application.phoneNumber}</p>
                    <p><span className="font-medium text-slate-900">ID number:</span> {application.idNumber}</p>
                </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Payment trail</p>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                    <p className="leading-6">{application.paymentLabel}</p>
                    <p><span className="font-medium text-slate-900">Proof files:</span> {application.paymentProofHistory.length + (application.paymentProofUrl ? 1 : 0)}</p>
                </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Reviewer shortcuts</p>
                <div className="mt-3 flex flex-col gap-2">
                    <Link
                        href={application.reviewHref}
                        className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                        <ShieldCheck className="mr-2 h-4 w-4"/>
                        Open review workspace
                    </Link>
                    {application.paymentProofUrl ? (
                        <Link
                            href={application.paymentProofUrl}
                            target="_blank"
                            className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                            <Wallet className="mr-2 h-4 w-4"/>
                            Open current payment proof
                        </Link>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

function renderMobileCard(row: Row<AdminApplicationsRow>) {
    const application = row.original;

    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    <Checkbox
                        checked={row.getIsSelected()}
                        onCheckedChange={(value) => row.toggleSelected(!!value)}
                        aria-label={`Select ${application.firstName} ${application.surname}`}
                        className="mt-1"
                    />
                    <div>
                        <p className="font-semibold text-slate-950">{application.firstName} {application.surname}</p>
                        <p className="mt-1 text-sm text-slate-600">{application.email}</p>
                        <p className="mt-1 text-xs text-slate-500">ID {application.idNumber} · {application.phoneNumber}</p>
                    </div>
                </div>
                <StatusBadge status={application.status}/>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Category</p>
                    <p className="mt-2 text-sm text-slate-900">{application.membershipCategory}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">County</p>
                    <p className="mt-2 text-sm text-slate-900">{application.county}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-3 sm:col-span-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Payment</p>
                    <p className="mt-2 text-sm leading-6 text-slate-900">{application.paymentLabel}</p>
                </div>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Actions</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                    <Link
                        href={application.reviewHref}
                        className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                        <FolderOpenDot className="mr-2 h-4 w-4"/>
                        Review
                    </Link>
                    <button
                        type="button"
                        onClick={() => row.toggleExpanded()}
                        className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                        {row.getIsExpanded() ? <ChevronDown className="mr-2 h-4 w-4"/> : <ChevronRight className="mr-2 h-4 w-4"/>}
                        Details
                    </button>
                    <a
                        href={`mailto:${application.email}`}
                        className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                        <Mail className="mr-2 h-4 w-4"/>
                        Email
                    </a>
                    <a
                        href={`tel:${application.phoneNumber}`}
                        className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                        <Phone className="mr-2 h-4 w-4"/>
                        Call
                    </a>
                </div>
            </div>

            {row.getIsExpanded() ? <div className="mt-4">{renderExpandedContent(row)}</div> : null}
        </div>
    );
}

export function AdminApplicationsDataTable({
    rows,
    currentParams,
    currentField,
    currentDirection,
}: Props) {
    const columns: ColumnDef<AdminApplicationsRow>[] = [
        {
            id: 'select',
            header: ({table}) => (
                <Checkbox
                    checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
                    onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                    aria-label="Select all applications"
                />
            ),
            cell: ({row}) => (
                <Checkbox
                    checked={row.getIsSelected()}
                    onCheckedChange={(value) => row.toggleSelected(!!value)}
                    aria-label={`Select ${row.original.firstName} ${row.original.surname}`}
                />
            ),
            enableSorting: false,
            enableHiding: false,
        },
        {
            id: 'expand',
            header: () => null,
            cell: ({row}) => (
                <button
                    type="button"
                    onClick={() => row.toggleExpanded()}
                    className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
                >
                    {row.getIsExpanded() ? <ChevronDown className="h-4 w-4"/> : <ChevronRight className="h-4 w-4"/>}
                    <span className="sr-only">Toggle application details</span>
                </button>
            ),
            enableSorting: false,
            enableHiding: false,
        },
        {
            id: 'applicant',
            accessorFn: (row) => `${row.firstName} ${row.surname} ${row.email} ${row.idNumber} ${row.phoneNumber}`,
            filterFn: (row, columnId, value) => {
                const search = String(value ?? '').trim().toLowerCase();
                if (!search) return true;
                return String(row.getValue(columnId)).toLowerCase().includes(search);
            },
            header: () => (
                <SortHeader
                    label="Applicant"
                    field="surname"
                    currentParams={currentParams}
                    currentField={currentField}
                    currentDirection={currentDirection}
                />
            ),
            cell: ({row}) => (
                <div>
                    <p className="font-semibold text-slate-950">{row.original.firstName} {row.original.surname}</p>
                    <p className="mt-1 text-slate-600">{row.original.email}</p>
                    <p className="mt-1 text-xs text-slate-500">ID {row.original.idNumber} · {row.original.phoneNumber}</p>
                </div>
            ),
            enableHiding: false,
        },
        {
            id: 'status',
            accessorKey: 'status',
            filterFn: (row, columnId, value) => !value || row.getValue(columnId) === value,
            header: () => (
                <SortHeader
                    label="Status"
                    field="status"
                    currentParams={currentParams}
                    currentField={currentField}
                    currentDirection={currentDirection}
                />
            ),
            cell: ({row}) => <StatusBadge status={row.original.status}/>,
        },
        {
            id: 'category',
            accessorKey: 'membershipCategory',
            header: 'Category',
        },
        {
            id: 'county',
            accessorKey: 'county',
            filterFn: (row, columnId, value) => !value || row.getValue(columnId) === value,
            header: () => (
                <SortHeader
                    label="County"
                    field="county"
                    currentParams={currentParams}
                    currentField={currentField}
                    currentDirection={currentDirection}
                />
            ),
        },
        {
            id: 'payment',
            accessorKey: 'paymentLabel',
            header: 'Payment',
            cell: ({row}) => <span className="leading-6 text-slate-700">{row.original.paymentLabel}</span>,
        },
        {
            id: 'resubmissions',
            accessorKey: 'resubmissionCount',
            header: () => (
                <SortHeader
                    label="Resubmissions"
                    field="resubmissionCount"
                    currentParams={currentParams}
                    currentField={currentField}
                    currentDirection={currentDirection}
                />
            ),
        },
        {
            id: 'updated',
            accessorKey: 'updatedLabel',
            header: () => (
                <SortHeader
                    label="Updated"
                    field="updatedAt"
                    currentParams={currentParams}
                    currentField={currentField}
                    currentDirection={currentDirection}
                />
            ),
        },
        {
            id: 'actions',
            header: () => <div className="text-right">Actions</div>,
            cell: ({row}) => (
                <div className="flex justify-end gap-2">
                    <Link
                        href={row.original.reviewHref}
                        className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                        <FolderOpenDot className="mr-2 h-4 w-4"/>
                        Review
                    </Link>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-700 hover:bg-slate-50"
                            >
                                <EllipsisVertical className="h-4 w-4"/>
                                <span className="sr-only">Open application actions</span>
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-64 rounded-2xl">
                            <DropdownMenuLabel>Application actions</DropdownMenuLabel>
                            <DropdownMenuSeparator/>
                            <DropdownMenuItem asChild>
                                <Link href={row.original.reviewHref}>
                                    Open review workspace
                                </Link>
                            </DropdownMenuItem>
                            {row.original.paymentProofUrl ? (
                                <DropdownMenuItem asChild>
                                    <Link href={row.original.paymentProofUrl} target="_blank">
                                        View current payment proof
                                        <ExternalLink className="ml-auto h-4 w-4"/>
                                    </Link>
                                </DropdownMenuItem>
                            ) : null}
                            {row.original.paymentProofHistory.map((proof) => (
                                <DropdownMenuItem key={proof.id} asChild>
                                    <Link href={proof.paymentProofUrl} target="_blank">
                                        Archived: {proof.paymentProofOriginalName}
                                    </Link>
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            ),
            enableHiding: false,
        },
    ];

    return (
        <DataTable
            columns={columns}
            data={rows}
            emptyState="No applications match the current filters."
            visibilityLabel="View columns"
            selectable
            preferenceKey="dashboard-admin-applications-table-columns"
            renderToolbar={renderToolbar}
            renderBulkActions={renderBulkActions}
            mobileCardRenderer={renderMobileCard}
            renderExpandedContent={renderExpandedContent}
        />
    );
}
