'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type PaymentRecordActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

type ManualPaymentRecordFormProps = {
  action: (state: PaymentRecordActionState, formData: FormData) => Promise<PaymentRecordActionState>;
  defaultAmount?: number | null;
  currency?: string;
};

const initialState: PaymentRecordActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving payment...' : 'Save payment record'}
    </Button>
  );
}

export function ManualPaymentRecordForm({ action, defaultAmount = null, currency = 'KES' }: ManualPaymentRecordFormProps) {
  const [state, formAction] = useActionState(action, initialState);
  const [paymentMethod, setPaymentMethod] = useState('MPESA');
  const [status, setStatus] = useState('VERIFIED');

  return (
    <form action={formAction} className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5">
      <div>
        <h3 className="text-lg font-semibold text-slate-950">Record member payment</h3>
        <p className="mt-1 text-sm text-slate-600">
          Add a verified or pending payment entry using the configured portal amount or the final settled amount you received.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="paymentMethod" className="text-xs uppercase tracking-[0.16em] text-slate-500">
            Payment method
          </FieldLabel>
          <input type="hidden" name="paymentMethod" value={paymentMethod} />
          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
            <SelectTrigger id="paymentMethod" className="h-11 w-full rounded-xl border-slate-300/90 bg-white px-4 text-sm text-slate-900">
              <SelectValue placeholder="Select payment method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MPESA">M-Pesa</SelectItem>
              <SelectItem value="BANK_TRANSFER">Bank transfer</SelectItem>
              <SelectItem value="CARD">Card</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="status" className="text-xs uppercase tracking-[0.16em] text-slate-500">
            Record status
          </FieldLabel>
          <input type="hidden" name="status" value={status} />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="status" className="h-11 w-full rounded-xl border-slate-300/90 bg-white px-4 text-sm text-slate-900">
              <SelectValue placeholder="Select record status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="VERIFIED">Verified</SelectItem>
              <SelectItem value="PENDING">Pending review</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="amount" className="text-xs uppercase tracking-[0.16em] text-slate-500">
            Amount ({currency})
          </FieldLabel>
          <Input id="amount" name="amount" type="number" min="1" step="1" defaultValue={defaultAmount ?? undefined} placeholder="e.g. 1500" />
          <FieldError>{state.fieldErrors?.amount?.[0]}</FieldError>
        </Field>

        <Field>
          <FieldLabel htmlFor="payerPhoneNumber" className="text-xs uppercase tracking-[0.16em] text-slate-500">
            Payer phone number
          </FieldLabel>
          <Input id="payerPhoneNumber" name="payerPhoneNumber" placeholder="e.g. 0712345678" />
          <FieldError>{state.fieldErrors?.payerPhoneNumber?.[0]}</FieldError>
        </Field>

        <Field className="md:col-span-2">
          <FieldLabel htmlFor="transactionReferenceNumber" className="text-xs uppercase tracking-[0.16em] text-slate-500">
            Transaction reference
          </FieldLabel>
          <Input id="transactionReferenceNumber" name="transactionReferenceNumber" placeholder="e.g. QKX83JY92" />
          <FieldError>{state.fieldErrors?.transactionReferenceNumber?.[0]}</FieldError>
        </Field>

        <Field>
          <FieldLabel htmlFor="paidAt" className="text-xs uppercase tracking-[0.16em] text-slate-500">
            Payment date
          </FieldLabel>
          <Input id="paidAt" name="paidAt" type="date" />
          <FieldError>{state.fieldErrors?.paidAt?.[0]}</FieldError>
        </Field>

        <Field>
          <FieldLabel htmlFor="paymentProof" className="text-xs uppercase tracking-[0.16em] text-slate-500">
            Optional proof file
          </FieldLabel>
          <Input id="paymentProof" name="paymentProof" type="file" accept=".pdf,image/png,image/jpeg,image/webp" />
        </Field>

        <Field className="md:col-span-2">
          <FieldLabel htmlFor="description" className="text-xs uppercase tracking-[0.16em] text-slate-500">
            Description
          </FieldLabel>
          <Input id="description" name="description" placeholder="e.g. Annual membership fee 2026" />
        </Field>

        <Field className="md:col-span-2">
          <FieldLabel htmlFor="notes" className="text-xs uppercase tracking-[0.16em] text-slate-500">
            Notes
          </FieldLabel>
          <Textarea id="notes" name="notes" placeholder="Optional admin notes about this payment entry" />
          <FieldDescription>Internal notes for reconciliation or follow-up.</FieldDescription>
        </Field>
      </div>

      {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-emerald-600">{state.success}</p> : null}

      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}
