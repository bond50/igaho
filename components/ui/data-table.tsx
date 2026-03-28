'use client';

import * as React from 'react';
import {
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    type ColumnDef,
    type ColumnFiltersState,
    type ExpandedState,
    type Row,
    type RowSelectionState,
    type Table as TanstackTable,
    type VisibilityState,
    useReactTable,
} from '@tanstack/react-table';

import {Button} from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';

type DataTableProps<TData, TValue> = {
    columns: ColumnDef<TData, TValue>[];
    data: TData[];
    emptyState: string;
    className?: string;
    visibilityLabel?: string;
    selectable?: boolean;
    preferenceKey?: string;
    renderToolbar?: (table: TanstackTable<TData>) => React.ReactNode;
    renderBulkActions?: (table: TanstackTable<TData>) => React.ReactNode;
    mobileCardRenderer?: (row: Row<TData>, table: TanstackTable<TData>) => React.ReactNode;
    renderExpandedContent?: (row: Row<TData>, table: TanstackTable<TData>) => React.ReactNode;
};

export function DataTable<TData, TValue>({
    columns,
    data,
    emptyState,
    className,
    visibilityLabel = 'Columns',
    selectable = false,
    preferenceKey,
    renderToolbar,
    renderBulkActions,
    mobileCardRenderer,
    renderExpandedContent,
}: DataTableProps<TData, TValue>) {
    const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
    const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
    const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
    const [expanded, setExpanded] = React.useState<ExpandedState>({});

    React.useEffect(() => {
        if (!preferenceKey || typeof window === 'undefined') return;

        try {
            const raw = window.localStorage.getItem(preferenceKey);
            if (!raw) return;
            const parsed = JSON.parse(raw) as VisibilityState;
            setColumnVisibility(parsed);
        } catch {
            // Ignore malformed saved preferences.
        }
    }, [preferenceKey]);

    React.useEffect(() => {
        if (!preferenceKey || typeof window === 'undefined') return;

        window.localStorage.setItem(preferenceKey, JSON.stringify(columnVisibility));
    }, [columnVisibility, preferenceKey]);

    const table = useReactTable({
        data,
        columns,
        state: {columnVisibility, rowSelection, columnFilters, expanded},
        enableRowSelection: selectable,
        getRowCanExpand: () => Boolean(renderExpandedContent),
        onColumnVisibilityChange: setColumnVisibility,
        onRowSelectionChange: setRowSelection,
        onColumnFiltersChange: setColumnFilters,
        onExpandedChange: setExpanded,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
    });

    const toggleableColumns = table.getAllLeafColumns().filter((column) => column.getCanHide());
    const selectedCount = table.getFilteredSelectedRowModel().rows.length;
    const visibleRows = table.getRowModel().rows;

    return (
        <div className={className}>
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-3">
                    <div className="text-sm text-slate-500">
                        {selectable ? (
                            selectedCount > 0 ? `${selectedCount} row${selectedCount === 1 ? '' : 's'} selected` : 'Select rows for bulk follow-up'
                        ) : (
                            'Review and manage application records in the current queue.'
                        )}
                    </div>

                    {renderToolbar ? renderToolbar(table) : null}
                </div>

                {toggleableColumns.length > 0 ? (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button type="button" variant="outline" className="rounded-xl">
                                {visibilityLabel}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 rounded-2xl">
                            <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {toggleableColumns.map((column) => (
                                <DropdownMenuCheckboxItem
                                    key={column.id}
                                    className="capitalize"
                                    checked={column.getIsVisible()}
                                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                                >
                                    {column.id.replaceAll('_', ' ')}
                                </DropdownMenuCheckboxItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : null}
            </div>

            {selectedCount > 0 && renderBulkActions ? (
                <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    {renderBulkActions(table)}
                </div>
            ) : null}

            {mobileCardRenderer ? (
                <div className="space-y-3 md:hidden">
                    {visibleRows.length ? (
                        visibleRows.map((row) => (
                            <div key={row.id}>{mobileCardRenderer(row, table)}</div>
                        ))
                    ) : (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-sm text-slate-500">
                            {emptyState}
                        </div>
                    )}
                </div>
            ) : null}

            <div className={mobileCardRenderer ? 'hidden md:block' : ''}>
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    <div className="max-h-[70vh] overflow-auto">
                        <Table>
                            <TableHeader className="bg-slate-50">
                                {table.getHeaderGroups().map((headerGroup) => (
                                    <TableRow key={headerGroup.id} className="hover:bg-transparent">
                                        {headerGroup.headers.map((header) => (
                                            <TableHead key={header.id} className="sticky top-0 z-10 bg-slate-50">
                                                {header.isPlaceholder
                                                    ? null
                                                    : flexRender(header.column.columnDef.header, header.getContext())}
                                            </TableHead>
                                        ))}
                                    </TableRow>
                                ))}
                            </TableHeader>
                            <TableBody>
                                {visibleRows.length ? (
                                    visibleRows.map((row) => (
                                        <React.Fragment key={row.id}>
                                            <TableRow data-state={row.getIsSelected() ? 'selected' : undefined}>
                                                {row.getVisibleCells().map((cell) => (
                                                    <TableCell
                                                        key={cell.id}
                                                        className={cell.column.id === 'select' || cell.column.id === 'expand' ? 'w-10' : undefined}
                                                    >
                                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                            {row.getIsExpanded() && renderExpandedContent ? (
                                                <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                                                    <TableCell colSpan={row.getVisibleCells().length} className="px-5 py-4">
                                                        {renderExpandedContent(row, table)}
                                                    </TableCell>
                                                </TableRow>
                                            ) : null}
                                        </React.Fragment>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell
                                            colSpan={columns.length}
                                            className="h-28 text-center text-sm text-slate-500"
                                        >
                                            {emptyState}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            </div>

            {selectable ? (
                <div className="mt-4 flex flex-col gap-2 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        {selectedCount} of {visibleRows.length} visible row{visibleRows.length === 1 ? '' : 's'} selected.
                    </div>
                    <div className="text-xs text-slate-400">
                        Queue selection is local to the current filtered table view.
                    </div>
                </div>
            ) : null}
        </div>
    );
}
