'use client';

import { Printer } from 'lucide-react';

import { Button } from '@/components/ui/button';

type PrintPageButtonProps = {
  label?: string;
};

export function PrintPageButton({ label = 'Print page' }: PrintPageButtonProps) {
  return (
    <Button type="button" onClick={() => window.print()}>
      <Printer className="mr-2 h-4 w-4" />
      {label}
    </Button>
  );
}
