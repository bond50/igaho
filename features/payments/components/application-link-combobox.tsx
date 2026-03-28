'use client';

import { useId, useMemo, useState } from 'react';

import { Input } from '@/components/ui/input';

type ApplicationOption = {
  id: string;
  label: string;
  description: string;
};

export function ApplicationLinkCombobox({
  name,
  options,
}: {
  name: string;
  options: ApplicationOption[];
}) {
  const listId = useId();
  const [query, setQuery] = useState('');

  const normalizedOptions = useMemo(
    () =>
      options.map((option) => ({
        ...option,
        displayValue: `${option.label} · ${option.description}`,
      })),
    [options],
  );

  const selected = normalizedOptions.find((option) => option.displayValue === query) ?? null;

  return (
    <div className="space-y-2">
      <Input
        list={listId}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search by name or email"
        autoComplete="off"
      />
      <datalist id={listId}>
        {normalizedOptions.map((option) => (
          <option key={option.id} value={option.displayValue} />
        ))}
      </datalist>
      <input type="hidden" name={name} value={selected?.id ?? ''} />
      <p className="text-xs text-slate-500">
        {selected ? `Selected: ${selected.label}.` : 'Start typing to choose a record from the list.'}
      </p>
    </div>
  );
}
