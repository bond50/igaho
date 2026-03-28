'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, LoaderCircle, RefreshCw, Smartphone } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { initiateMemberRenewalStkPush, verifyLatestMemberRenewalPaymentNow } from '@/features/payments/actions/daraja';

const initialState = {} as { error?: string; success?: string; fieldErrors?: Record<string, string[] | undefined> };

type RenewalIntent = {
  status: 'CREATED' | 'AWAITING_PAYMENT' | 'VERIFIED' | 'FAILED' | 'CANCELLED' | 'EXPIRED' | 'LOCKED';
  payerPhoneNumber: string | null;
  totalAmount: number;
  currency: string;
  billingYear: number | null;
  checkoutRequestId: string | null;
  receiptNumber: string | null;
  lastError: string | null;
} | null;

type RenewalRequest = {
  status: 'INITIATED' | 'AWAITING_CALLBACK' | 'CALLBACK_RECEIVED' | 'SUCCESS' | 'VERIFIED' | 'FAILED' | 'CANCELLED' | 'TIMEOUT';
  phoneNumber: string;
  amount: number;
  updatedAt: string;
  checkoutRequestId: string | null;
  receiptNumber: string | null;
  resultDesc: string | null;
} | null;

type Props = {
  renewalsEnabled: boolean;
  renewalMode: 'MANUAL_REVIEW' | 'PAY_AND_ACTIVATE';
  renewalDue: boolean;
  renewalInGracePeriod: boolean;
  renewalReminderWindowOpen: boolean;
  membershipStateLabel: string;
  currentRenewalYear: number;
  coverageStartsAt: string | null;
  coverageEndsAt: string | null;
  graceEndsAt: string | null;
  daysRemaining: number | null;
  renewalReminderLeadDays: number;
  renewalReminderFrequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  annualRenewalFee: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  currentIntent: RenewalIntent;
  latestRequest: RenewalRequest;
};

function formatIntentLabel(status: NonNullable<RenewalIntent>['status']) {
  const labels: Record<NonNullable<RenewalIntent>['status'], string> = {
    CREATED: 'Renewal created',
    AWAITING_PAYMENT: 'Awaiting payment',
    VERIFIED: 'Payment received',
    FAILED: 'Payment failed',
    CANCELLED: 'Payment cancelled',
    EXPIRED: 'Payment expired',
    LOCKED: 'Renewal access active',
  };

  return labels[status];
}

function formatDateLabel(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function MemberRenewalPanel({
  renewalsEnabled,
  renewalMode,
  renewalDue,
  renewalInGracePeriod,
  renewalReminderWindowOpen,
  membershipStateLabel,
  currentRenewalYear,
  coverageStartsAt,
  coverageEndsAt,
  graceEndsAt,
  daysRemaining,
  renewalReminderLeadDays,
  renewalReminderFrequency,
  annualRenewalFee,
  taxAmount,
  totalAmount,
  currency,
  currentIntent,
  latestRequest,
}: Props) {
  const router = useRouter();
  const [requestState, requestAction] = useActionState(initiateMemberRenewalStkPush, initialState);
  const [verifyState, setVerifyState] = useState<{ error?: string; success?: string }>({});
  const [isVerifying, setIsVerifying] = useState(false);
  const defaultPhone = currentIntent?.payerPhoneNumber ?? latestRequest?.phoneNumber ?? '';
  const renewalCovered = renewalsEnabled && !renewalDue;
  const coveredFrom = formatDateLabel(coverageStartsAt);
  const coveredThrough = formatDateLabel(coverageEndsAt) ?? `31 Dec ${currentRenewalYear}`;
  const graceThrough = formatDateLabel(graceEndsAt);

  useEffect(() => {
    if (requestState.success) {
      toast.success(requestState.success);
      router.refresh();
    }
    if (requestState.error) {
      toast.error(requestState.error);
    }
  }, [requestState, router]);

  useEffect(() => {
    if (verifyState.success) {
      toast.success(verifyState.success);
      router.refresh();
    }
    if (verifyState.error) {
      toast.error(verifyState.error);
    }
  }, [verifyState, router]);

  async function handleVerifyNow() {
    setIsVerifying(true);
    try {
      const result = await verifyLatestMemberRenewalPaymentNow();
      setVerifyState(result);
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <Card className="rounded-3xl border-[color:var(--border-soft)] bg-white shadow-none">
      <CardHeader className="p-5 pb-4 sm:p-6 sm:pb-4">
        <CardTitle className="text-lg font-medium text-slate-950">{renewalCovered ? membershipStateLabel : renewalInGracePeriod ? 'Grace period' : 'Annual renewal'}</CardTitle>
        <CardDescription className="mt-1 max-w-2xl">
          {!renewalsEnabled
            ? 'Renewals are currently disabled by the admin team.'
            : renewalInGracePeriod
              ? `Coverage ended on ${coveredThrough}.${graceThrough ? ` Grace period ends on ${graceThrough}.` : ''}`
              : renewalDue
                ? `Renewal is due for ${currentRenewalYear}. ${renewalMode === 'PAY_AND_ACTIVATE' ? 'Access restores automatically after successful payment.' : 'Admin approval is required after payment.'}`
                : `Active through ${coveredThrough}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 p-5 pt-0 sm:p-6 sm:pt-0">
        {renewalCovered ? (
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Current state</p>
              <p className="mt-2 text-base font-semibold text-slate-950">{membershipStateLabel}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Active through</p>
              <p className="mt-2 text-xl font-semibold text-slate-950">{coveredThrough}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Coverage</p>
              <p className="mt-2 text-sm font-medium text-slate-950">
                {coveredFrom ? `${coveredFrom} to ${coveredThrough}` : coveredThrough}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Time remaining</p>
              <p className="mt-2 text-xl font-semibold text-slate-950">
                {daysRemaining !== null ? `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining` : 'Covered'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {daysRemaining !== null && daysRemaining > renewalReminderLeadDays
                  ? `Renewal reminders start in ${daysRemaining - renewalReminderLeadDays} day${daysRemaining - renewalReminderLeadDays === 1 ? '' : 's'}.`
                  : renewalReminderWindowOpen
                    ? `Reminder frequency: ${renewalReminderFrequency === 'DAILY' ? 'Daily' : renewalReminderFrequency === 'MONTHLY' ? 'Monthly' : 'Weekly'}.`
                    : 'Coverage is still active.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-4">
            <div className={`rounded-2xl border p-4 ${renewalInGracePeriod ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
              <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${renewalInGracePeriod ? 'text-amber-700' : 'text-slate-500'}`}>Current state</p>
              <p className="mt-2 text-base font-semibold text-slate-950">{membershipStateLabel}</p>
              {renewalInGracePeriod && graceThrough ? <p className="mt-1 text-xs text-amber-700">Grace ends {graceThrough}</p> : null}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Coverage</p>
              <p className="mt-2 text-sm font-medium text-slate-950">
                {coveredFrom ? `${coveredFrom} to ${coveredThrough}` : coveredThrough}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Amount due</p>
              <p className="mt-2 text-xl font-semibold text-slate-950">{currency} {totalAmount.toLocaleString()}</p>
              {taxAmount > 0 ? <p className="mt-1 text-xs text-slate-500">Includes tax of {currency} {taxAmount.toLocaleString()}</p> : null}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Renewal year</p>
              <p className="mt-2 text-xl font-semibold text-slate-950">{currentRenewalYear}</p>
            </div>
          </div>
        )}

        {!renewalsEnabled ? null : renewalDue || (currentIntent && !renewalCovered) ? (
          <>
            {renewalInGracePeriod ? (
              <Alert className="rounded-2xl border-amber-200 bg-amber-50 text-amber-800">
                <AlertTriangle className="text-amber-700" />
                <AlertTitle className="text-amber-800">Grace period active</AlertTitle>
                <AlertDescription>
                  {graceThrough ? `Renew before ${graceThrough} to avoid a gap in member access.` : 'Renew now to avoid a gap in member access.'}
                </AlertDescription>
              </Alert>
            ) : null}

            {currentIntent ? (
              <Alert className="rounded-2xl border-slate-200 bg-slate-50 text-slate-700">
                <CheckCircle2 className="text-slate-600" />
                <AlertTitle className="text-slate-900">Renewal status</AlertTitle>
                <AlertDescription>
                  <p>{formatIntentLabel(currentIntent.status)}</p>
                  <p className="mt-1 text-sm text-slate-600">{currentIntent.receiptNumber ? `Receipt: ${currentIntent.receiptNumber}` : currentIntent.lastError ?? 'Use the actions below to continue.'}</p>
                </AlertDescription>
              </Alert>
            ) : null}

            <form action={requestAction} className="grid gap-4 rounded-2xl border border-slate-200 bg-[var(--surface-elevated)] p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <Field>
                <FieldLabel htmlFor="renewal-phone">Phone number</FieldLabel>
                <Input id="renewal-phone" name="phoneNumber" defaultValue={defaultPhone} placeholder="2547XXXXXXXX" />
                <FieldDescription>Enter the Safaricom number that should receive the renewal payment prompt. {taxAmount > 0 ? 'The total includes tax.' : ''}</FieldDescription>
                <FieldError>{requestState.fieldErrors?.phoneNumber?.[0]}</FieldError>
              </Field>
              <Button type="submit" className="rounded-xl sm:min-w-48">
                <Smartphone className="mr-2 h-4 w-4" />
                Send renewal prompt
              </Button>
            </form>

            {latestRequest ? (
              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">Latest mobile payment</p>
                  <p className="mt-1 text-sm text-slate-600">{latestRequest.status.replaceAll('_', ' ')} � {latestRequest.phoneNumber} � {currency} {latestRequest.amount.toLocaleString()}</p>
                  {latestRequest.resultDesc ? <p className="mt-1 text-xs text-slate-500">{latestRequest.resultDesc}</p> : null}
                </div>
                <Button type="button" variant="outline" className="rounded-xl" onClick={handleVerifyNow} disabled={isVerifying}>
                  {isVerifying ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Check payment now
                </Button>
              </div>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

