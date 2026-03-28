'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type FilterOption = {
  value: string;
  label: string;
};

type DashboardQueueFiltersProps = {
  query: string;
  statuses: string[];
  counties: string[];
  categoryIds: string[];
  pageSize: number;
  sortField: string;
  sortDirection: string;
  view: string;
  countyOptions: FilterOption[];
  categoryOptions: FilterOption[];
};

function toggleValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function getSelectionLabel(selected: string[], options: FilterOption[], emptyLabel: string) {
  if (selected.length === 0) return emptyLabel;
  if (selected.length === 1) {
    return options.find((option) => option.value === selected[0])?.label ?? selected[0];
  }
  return `${selected.length} selected`;
}

function MultiSelectField({
  fieldId,
  name,
  label,
  description,
  emptyLabel,
  options,
  selected,
  onToggle,
}: {
  fieldId: string;
  name: string;
  label: string;
  description: string;
  emptyLabel: string;
  options: FilterOption[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const triggerLabel = getSelectionLabel(selected, options, emptyLabel);

  return (
    <Field>
      <FieldLabel htmlFor={fieldId} className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{label}</FieldLabel>
      {selected.map((value) => (
        <input key={value} type="hidden" name={name} value={value} />
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full justify-between rounded-xl border-slate-200 bg-white px-3 font-normal text-slate-900 shadow-[inset_0_1px_2px_rgba(15,23,42,0.03)] hover:bg-white hover:border-slate-300"
            id={fieldId}
          >
            <span className="truncate">{triggerLabel}</span>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={8} className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[15rem] rounded-xl border-slate-200 p-1.5 shadow-[0_18px_48px_rgba(15,23,42,0.12)]">
          <DropdownMenuLabel className="px-2.5 pb-1 text-[11px] uppercase tracking-[0.14em] text-slate-500">{label}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {options.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={selected.includes(option.value)}
              onCheckedChange={() => onToggle(option.value)}
              onSelect={(event) => event.preventDefault()}
              className="rounded-lg px-2.5 py-2 text-sm text-slate-700"
            >
              {option.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <FieldDescription>{description}</FieldDescription>
    </Field>
  );
}

export function DashboardQueueFilters({
  query,
  statuses,
  counties,
  categoryIds,
  pageSize,
  sortField,
  sortDirection,
  view,
  countyOptions,
  categoryOptions,
}: DashboardQueueFiltersProps) {
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(statuses);
  const [selectedCounties, setSelectedCounties] = useState<string[]>(counties);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(categoryIds);
  const [selectedPageSize, setSelectedPageSize] = useState(String(pageSize));

  const statusOptions = useMemo<FilterOption[]>(() => [
    { value: 'PENDING', label: 'Pending' },
    { value: 'ACTIVE', label: 'Active' },
    { value: 'REJECTED', label: 'Rejected' },
  ], []);

  return (
    <form method="get" className="grid gap-4 rounded-2xl border border-[color:var(--border-soft)] bg-[var(--surface-elevated)] p-4 md:grid-cols-2 xl:grid-cols-6">
      <Field className="xl:col-span-2">
        <FieldLabel htmlFor="q" className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Search</FieldLabel>
        <Input id="q" name="q" defaultValue={query} placeholder="Name, email, ID number, county, category" />
        <FieldDescription>Search by applicant, contact, county, or category.</FieldDescription>
      </Field>

      <MultiSelectField
        fieldId="statuses"
        name="statuses"
        label="Statuses"
        description="Filter to one or more review statuses."
        emptyLabel="All statuses"
        options={statusOptions}
        selected={selectedStatuses}
        onToggle={(value) => setSelectedStatuses((current) => toggleValue(current, value))}
      />

      <MultiSelectField
        fieldId="counties"
        name="counties"
        label="Counties"
        description="Filter the queue to one or more counties."
        emptyLabel="All counties"
        options={countyOptions}
        selected={selectedCounties}
        onToggle={(value) => setSelectedCounties((current) => toggleValue(current, value))}
      />

      <MultiSelectField
        fieldId="categories"
        name="categories"
        label="Categories"
        description="Filter by one or more membership categories."
        emptyLabel="All categories"
        options={categoryOptions}
        selected={selectedCategories}
        onToggle={(value) => setSelectedCategories((current) => toggleValue(current, value))}
      />

      <Field>
        <FieldLabel htmlFor="pageSize" className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Page size</FieldLabel>
        <input type="hidden" name="pageSize" value={selectedPageSize} />
        <Select value={selectedPageSize} onValueChange={setSelectedPageSize}>
          <SelectTrigger id="pageSize" className="h-11 w-full rounded-xl border-slate-200 bg-white text-slate-900 shadow-[inset_0_1px_2px_rgba(15,23,42,0.03)]">
            <SelectValue placeholder="Choose page size" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="5">5 rows</SelectItem>
            <SelectItem value="10">10 rows</SelectItem>
            <SelectItem value="25">25 rows</SelectItem>
            <SelectItem value="50">50 rows</SelectItem>
          </SelectContent>
        </Select>
        <FieldDescription>Choose how many records appear per page.</FieldDescription>
      </Field>

      <input type="hidden" name="sort" value={sortField} />
      <input type="hidden" name="direction" value={sortDirection} />
      <input type="hidden" name="view" value={view === 'all' ? '' : view} />
      <input type="hidden" name="page" value="1" />

      <div className="flex items-end gap-2 xl:col-span-6 xl:justify-end">
        <Button type="submit" variant="default">
          Apply filters
        </Button>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-[var(--foreground)] shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200 hover:border-slate-400 hover:bg-slate-50"
        >
          Reset
        </Link>
      </div>
    </form>
  );
}