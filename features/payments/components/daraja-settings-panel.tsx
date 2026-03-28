'use client';

import { useActionState, useEffect, useEffectEvent, useState } from 'react';
import { CheckCircle2, CreditCard, Smartphone, TriangleAlert, Wallet } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { initiateAdminPaymentRequest, verifyMpesaRequestNow } from '@/features/payments/actions/daraja';
import { recordAdminPayment } from '@/features/payments/actions/operations';
import { ApplicationLinkCombobox } from '@/features/payments/components/application-link-combobox';
import { interpretDarajaFailure, type MpesaRequestStatus } from '@/features/payments/lib/daraja-result';

type DarajaStatus = {
  environment: 'sandbox' | 'production';
  callbackUrl: string;
  baseUrl: string;
  transactionType: 'CustomerPayBillOnline' | 'CustomerBuyGoodsOnline';
  isConfigured: boolean;
  missing: string[];
};

type RecentRequest = {
  id: string;
  phoneNumber: string;
  amount: number;
  accountReference: string;
  transactionDesc: string;
  merchantRequestId: string | null;
  checkoutRequestId: string | null;
  customerMessage: string | null;
  status: MpesaRequestStatus;
  resultCode: number | null;
  resultDesc: string | null;
  mpesaReceiptNumber: string | null;
  callbackUrl: string;
  reconciliationAttemptCount: number;
  lastReconciledAt: string | null;
  lastReconciliationSource: string | null;
  lastReconciliationNote: string | null;
  createdAt: string;
  updatedAt: string;
  application: {
    id: string;
    firstName: string;
    surname: string;
    email: string;
    membershipNumber: string | null;
  } | null;
  paymentIntent: {
    id: string;
    purpose: 'APPLICATION_FEE' | 'ANNUAL_RENEWAL';
    billingYear: number | null;
  } | null;
};

type ApplicationOption = {
  id: string;
  label: string;
  description: string;
};

type ActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

type AdminStatusStreamPayload = {
  recentRequests?: RecentRequest[];
};

const initialState: ActionState = {};
const liveStatuses: MpesaRequestStatus[] = ['INITIATED', 'AWAITING_CALLBACK', 'CALLBACK_RECEIVED'];

function StatusBadge({ status }: { status: RecentRequest['status'] }) {
  const styles =
    status === 'SUCCESS' || status === 'VERIFIED'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : status === 'FAILED' || status === 'CANCELLED' || status === 'TIMEOUT'
        ? 'border-rose-200 bg-rose-50 text-rose-700'
        : 'border-amber-200 bg-amber-50 text-amber-700';

  return <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold tracking-[0.12em] ${styles}`}>{status}</span>;
}

function purposeLabel(purpose: 'APPLICATION_FEE' | 'ANNUAL_RENEWAL', billingYear?: number | null) {
  return purpose === 'ANNUAL_RENEWAL'
    ? `Annual renewal${billingYear ? ` · ${billingYear}` : ''}`
    : 'Application fee';
}

export function DarajaSettingsPanel({ status, recentRequests, applicationOptions }: { status: DarajaStatus; recentRequests: RecentRequest[]; applicationOptions: ApplicationOption[] }) {
  const [requestState, requestAction] = useActionState(initiateAdminPaymentRequest, initialState);
  const [recordState, recordAction] = useActionState(recordAdminPayment, initialState);
  const [requests, setRequests] = useState(recentRequests);
  const [requestPurpose, setRequestPurpose] = useState<'APPLICATION_FEE' | 'ANNUAL_RENEWAL'>('APPLICATION_FEE');
  const [recordPurpose, setRecordPurpose] = useState<'APPLICATION_FEE' | 'ANNUAL_RENEWAL'>('APPLICATION_FEE');
  const [recordMethod, setRecordMethod] = useState<'MPESA' | 'BANK_TRANSFER' | 'CARD'>('MPESA');
  const [recordStatus, setRecordStatus] = useState<'VERIFIED' | 'PENDING' | 'REJECTED'>('VERIFIED');
  const [verificationMessages, setVerificationMessages] = useState<Record<string, { tone: 'success' | 'error'; message: string }>>({});
  const [verifyingRequestId, setVerifyingRequestId] = useState<string | null>(null);

  useEffect(() => {
    setRequests(recentRequests);
  }, [recentRequests]);

  useEffect(() => {
    if (requestState.success) toast.success(requestState.success);
    if (requestState.error) toast.error(requestState.error);
  }, [requestState]);

  useEffect(() => {
    if (recordState.success) toast.success(recordState.success);
    if (recordState.error) toast.error(recordState.error);
  }, [recordState]);

  const refreshRequests = useEffectEvent(async () => {
    try {
      const response = await fetch('/api/payments/mpesa/status?scope=admin&limit=10', {
        cache: 'no-store',
        credentials: 'same-origin',
      });

      if (!response.ok) return;
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) return;

      const data = (await response.json()) as AdminStatusStreamPayload;
      if (data.recentRequests) setRequests(data.recentRequests);
    } catch {
      // Ignore transient refresh failures.
    }
  });

  const verifyRequestNow = useEffectEvent(async (requestId: string) => {
    setVerifyingRequestId(requestId);

    try {
      const result = await verifyMpesaRequestNow(requestId);
      if (result.error) {
        setVerificationMessages((current) => ({ ...current, [requestId]: { tone: 'error', message: result.error } }));
        toast.error(result.error);
        return;
      }

      if ('success' in result && result.success) {
        setVerificationMessages((current) => ({ ...current, [requestId]: { tone: 'success', message: result.success } }));
        toast.success(result.success);
      }
    } finally {
      setVerifyingRequestId(null);
    }
  });

  useEffect(() => {
    if (requestState.success || recordState.success) {
      void refreshRequests();
    }
  }, [requestState.success, recordState.success, refreshRequests]);

  useEffect(() => {
    if (!requests.some((request) => liveStatuses.includes(request.status))) return;

    const stream = new EventSource('/api/payments/mpesa/status/stream?scope=admin&limit=10');

    stream.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as AdminStatusStreamPayload;
        if (payload.recentRequests) {
          setRequests(payload.recentRequests);
        }
      } catch {
        // Ignore malformed payloads and wait for the next event.
      }
    };

    stream.onerror = () => {
      // EventSource retries automatically while live requests are present.
    };

    return () => {
      stream.close();
    };
  }, [requests]);

  return (
    <Card id="payment-operations" className="portal-surface-panel rounded-3xl border-[color:var(--border-soft)] shadow-none">
      <CardHeader className="p-5 pb-4 sm:p-6 sm:pb-4">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-[var(--brand-soft)] p-3 text-[var(--brand)]">
            <Smartphone className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-lg font-medium text-slate-950">Payment requests</CardTitle>
            <CardDescription className="mt-1 max-w-xl">Send paybill requests, record payments already received, and follow recent payment updates.</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 p-5 pt-0 sm:p-6 sm:pt-0">
        <Card className="rounded-3xl border-[color:var(--border-soft)] bg-[var(--surface-elevated)] shadow-none">
          <CardContent className="space-y-5 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="portal-kicker text-slate-500">Connection status</p>
                <p className="mt-2 text-2xl font-medium tracking-tight text-slate-950">
                  {status.isConfigured ? 'Ready to send paybill requests' : 'Paybill setup needs attention'}
                </p>
                <p className="mt-2 text-sm text-slate-600">{status.environment === 'sandbox' ? 'Test mode is active.' : 'Live paybill mode is active.'}</p>
              </div>
              <Badge variant="outline" className={`rounded-full px-3 py-1 text-[11px] font-semibold ${status.isConfigured ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                {status.isConfigured ? 'Ready' : 'Needs setup'}
              </Badge>
            </div>

            {!status.isConfigured ? (
              <Alert className="rounded-2xl border-amber-200 bg-amber-50/70 text-slate-700">
                <TriangleAlert className="text-amber-600" />
                <AlertTitle className="text-slate-900">Complete paybill setup first</AlertTitle>
                <AlertDescription className="text-slate-700">
                  <ul className="space-y-1">
                    {status.missing.map((item) => (
                      <li key={item}>- {item}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="rounded-2xl border-emerald-200 bg-emerald-50/70 text-emerald-700">
                <CheckCircle2 className="text-emerald-700" />
                <AlertTitle className="text-emerald-700">Paybill ready</AlertTitle>
                <AlertDescription className="text-emerald-700">You can send payment requests and confirm delayed payments from this screen.</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="rounded-3xl border-[color:var(--border-soft)] bg-[var(--surface-elevated)] shadow-none">
            <CardHeader className="p-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-white p-3 text-[var(--brand)]"><CreditCard className="h-5 w-5" /></div>
                <div>
                  <CardTitle className="text-base font-medium text-slate-950">Request payment</CardTitle>
                  <CardDescription className="mt-1">Send a paybill payment prompt to an applicant or member.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <form action={requestAction} className="space-y-5">
                <input type="hidden" name="purpose" value={requestPurpose} />

                <Field>
                  <FieldLabel>Payment type</FieldLabel>
                  <Select value={requestPurpose} onValueChange={(value: 'APPLICATION_FEE' | 'ANNUAL_RENEWAL') => setRequestPurpose(value)}>
                    <SelectTrigger className="h-11 w-full rounded-xl">
                      <SelectValue placeholder="Select charge type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="APPLICATION_FEE">Application fee</SelectItem>
                      <SelectItem value="ANNUAL_RENEWAL">Annual renewal</SelectItem>
                    </SelectContent>
                  </Select>
                  <FieldError>{requestState.fieldErrors?.purpose?.[0]}</FieldError>
                </Field>

                <Field>
                  <FieldLabel>Person to charge</FieldLabel>
                  <ApplicationLinkCombobox name="applicationId" options={applicationOptions} />
                  <FieldDescription>{requestPurpose === 'ANNUAL_RENEWAL' ? 'Choose the active member who should pay the renewal fee.' : 'Choose the applicant who should pay the application fee.'}</FieldDescription>
                  <FieldError>{requestState.fieldErrors?.applicationId?.[0]}</FieldError>
                </Field>

                <div className="grid gap-5 md:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="requestPhoneNumber" required>Phone number to prompt</FieldLabel>
                    <Input id="requestPhoneNumber" name="phoneNumber" placeholder="2547XXXXXXXX" required />
                    <FieldError>{requestState.fieldErrors?.phoneNumber?.[0]}</FieldError>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="requestAmount" required>Amount</FieldLabel>
                    <Input id="requestAmount" name="amount" type="number" min="1" placeholder="1000" required />
                    <FieldError>{requestState.fieldErrors?.amount?.[0]}</FieldError>
                  </Field>
                </div>

                {requestPurpose === 'ANNUAL_RENEWAL' ? (
                  <Field>
                    <FieldLabel htmlFor="requestBillingYear">Renewal year</FieldLabel>
                    <Input id="requestBillingYear" name="billingYear" type="number" min="2024" max="2100" defaultValue={new Date().getFullYear()} />
                    <FieldDescription>Used to label the renewal payment in history.</FieldDescription>
                    <FieldError>{requestState.fieldErrors?.billingYear?.[0]}</FieldError>
                  </Field>
                ) : null}

                {requestState.error ? <p className="text-sm text-rose-600">{requestState.error}</p> : null}
                {requestState.success ? <p className="text-sm text-emerald-600">{requestState.success}</p> : null}

                <Button type="submit" disabled={!status.isConfigured}>Send paybill request</Button>
              </form>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-[color:var(--border-soft)] bg-[var(--surface-elevated)] shadow-none">
            <CardHeader className="p-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-white p-3 text-[var(--brand)]"><Wallet className="h-5 w-5" /></div>
                <div>
                  <CardTitle className="text-base font-medium text-slate-950">Record payment</CardTitle>
                  <CardDescription className="mt-1">Use this when payment was already received and should still appear in the portal.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <form action={recordAction} className="space-y-5">
                <input type="hidden" name="purpose" value={recordPurpose} />
                <input type="hidden" name="paymentMethod" value={recordMethod} />
                <input type="hidden" name="status" value={recordStatus} />

                <Field>
                  <FieldLabel>Payment type</FieldLabel>
                  <Select value={recordPurpose} onValueChange={(value: 'APPLICATION_FEE' | 'ANNUAL_RENEWAL') => setRecordPurpose(value)}>
                    <SelectTrigger className="h-11 w-full rounded-xl">
                      <SelectValue placeholder="Select payment type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="APPLICATION_FEE">Application fee</SelectItem>
                      <SelectItem value="ANNUAL_RENEWAL">Annual renewal</SelectItem>
                    </SelectContent>
                  </Select>
                  <FieldError>{recordState.fieldErrors?.purpose?.[0]}</FieldError>
                </Field>

                <Field>
                  <FieldLabel>Applicant or member</FieldLabel>
                  <ApplicationLinkCombobox name="applicationId" options={applicationOptions} />
                  <FieldDescription>{recordPurpose === 'ANNUAL_RENEWAL' ? 'Choose an active member for renewal.' : 'Choose the applicant whose fee was received.'}</FieldDescription>
                  <FieldError>{recordState.fieldErrors?.applicationId?.[0]}</FieldError>
                </Field>

                <div className="grid gap-5 md:grid-cols-2">
                  <Field>
                    <FieldLabel>Payment method</FieldLabel>
                    <Select value={recordMethod} onValueChange={(value: 'MPESA' | 'BANK_TRANSFER' | 'CARD') => setRecordMethod(value)}>
                      <SelectTrigger className="h-11 w-full rounded-xl">
                        <SelectValue placeholder="Select how it was paid" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MPESA">M-Pesa</SelectItem>
                        <SelectItem value="BANK_TRANSFER">Bank transfer</SelectItem>
                        <SelectItem value="CARD">Card</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field>
                    <FieldLabel>Record status</FieldLabel>
                    <Select value={recordStatus} onValueChange={(value: 'VERIFIED' | 'PENDING' | 'REJECTED') => setRecordStatus(value)}>
                      <SelectTrigger className="h-11 w-full rounded-xl">
                        <SelectValue placeholder="Select payment state" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="VERIFIED">Verified</SelectItem>
                        <SelectItem value="PENDING">Pending review</SelectItem>
                        <SelectItem value="REJECTED">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="recordReference" required>Payment reference</FieldLabel>
                    <Input id="recordReference" name="transactionReferenceNumber" placeholder="QJH7D2L9P3" required />
                    <FieldError>{recordState.fieldErrors?.transactionReferenceNumber?.[0]}</FieldError>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="recordAmount" required>Amount</FieldLabel>
                    <Input id="recordAmount" name="amount" type="number" min="1" placeholder="1000" required />
                    <FieldError>{recordState.fieldErrors?.amount?.[0]}</FieldError>
                  </Field>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="recordPaidAt" required>Paid at</FieldLabel>
                    <Input id="recordPaidAt" name="paidAt" type="datetime-local" required />
                    <FieldError>{recordState.fieldErrors?.paidAt?.[0]}</FieldError>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="recordPayerPhone">Payer phone number</FieldLabel>
                    <Input id="recordPayerPhone" name="payerPhoneNumber" placeholder="2547XXXXXXXX" />
                    <FieldError>{recordState.fieldErrors?.payerPhoneNumber?.[0]}</FieldError>
                  </Field>
                </div>

                {recordPurpose === 'ANNUAL_RENEWAL' ? (
                  <Field>
                    <FieldLabel htmlFor="recordBillingYear">Billing year</FieldLabel>
                    <Input id="recordBillingYear" name="billingYear" type="number" min="2024" max="2100" defaultValue={new Date().getFullYear()} />
                    <FieldDescription>Used to label the renewal in payment history.</FieldDescription>
                    <FieldError>{recordState.fieldErrors?.billingYear?.[0]}</FieldError>
                  </Field>
                ) : null}

                <Field>
                  <FieldLabel htmlFor="recordNotes">Notes</FieldLabel>
                  <Textarea id="recordNotes" name="notes" placeholder="Optional note about how the payment was received or checked." className="min-h-24" />
                </Field>

                {recordState.error ? <p className="text-sm text-rose-600">{recordState.error}</p> : null}
                {recordState.success ? <p className="text-sm text-emerald-600">{recordState.success}</p> : null}

                <Button type="submit" variant="outline">Record payment</Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <Separator className="bg-[var(--border-soft)]" />

        <div className="space-y-4">
          <div>
            <h4 className="text-lg font-medium text-slate-950">Recent payment requests</h4>
            <p className="text-sm text-slate-600">Recent requests appear here while they are waiting for payment, update, or review.</p>
          </div>

          {requests.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">No payment requests recorded yet.</div>
          ) : (
            <div className="space-y-3">
              {requests.map((request) => {
                const failure = interpretDarajaFailure(request.resultCode, request.resultDesc, request.status);
                const targetName = request.application
                  ? `${request.application.firstName} ${request.application.surname}`.trim() || request.application.email
                  : request.phoneNumber;
                const purpose = request.paymentIntent ? purposeLabel(request.paymentIntent.purpose, request.paymentIntent.billingYear) : 'Payment request';

                return (
                  <Card key={request.id} className="rounded-2xl border-[color:var(--border-soft)] bg-white shadow-none">
                    <CardContent className="p-5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-3 text-sm text-slate-700">
                          <div className="flex flex-wrap items-center gap-3">
                            <StatusBadge status={request.status} />
                            <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-slate-600">{purpose}</Badge>
                            <p className="font-medium text-slate-900">{targetName}</p>
                            <p>KES {request.amount.toLocaleString()}</p>
                          </div>
                          <p><span className="font-medium text-slate-900">Reference:</span> {request.accountReference}</p>
                          <p><span className="font-medium text-slate-900">Phone:</span> {request.phoneNumber}</p>
                          <p><span className="font-medium text-slate-900">Paybill receipt:</span> {request.mpesaReceiptNumber ?? 'Waiting for update'}</p>

                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="font-medium text-slate-900">Current status</p>
                            <p className="mt-1 text-slate-700">{failure.detail}</p>
                            {failure.guidance ? <p className="mt-1 text-slate-600">What to do next: {failure.guidance}</p> : null}
                          </div>

                          <div className="flex flex-wrap gap-3">
                            {request.status !== 'SUCCESS' && request.status !== 'VERIFIED' ? (
                              <Button type="button" size="sm" variant="outline" disabled={verifyingRequestId === request.id} onClick={() => { void verifyRequestNow(request.id); }}>
                                {verifyingRequestId === request.id ? 'Checking...' : <><CheckCircle2 className="mr-2 h-4 w-4" />Confirm payment now</>}
                              </Button>
                            ) : null}
                          </div>

                          {verificationMessages[request.id] ? (
                            <div className={`rounded-2xl border px-4 py-3 text-sm ${verificationMessages[request.id].tone === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                              {verificationMessages[request.id].message}
                            </div>
                          ) : null}
                        </div>

                        <div className="text-xs text-slate-500 lg:max-w-[16rem] lg:text-right">
                          <p>Created {new Date(request.createdAt).toLocaleString()}</p>
                          <p className="mt-1">Updated {new Date(request.updatedAt).toLocaleString()}</p>
                          {request.lastReconciliationNote ? <p className="mt-2">Latest note: {request.lastReconciliationNote}</p> : null}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
