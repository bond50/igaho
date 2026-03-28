'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useActionState, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, CircleHelp, LoaderCircle, Smartphone, UploadCloud, UserRoundPen } from 'lucide-react';
import { useFormStatus } from 'react-dom';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { saveApplicationDraft, submitApplication } from '@/features/application/actions/application';
import { applicationReviewFieldOptions } from '@/features/application/lib/review-fields';
import { membershipTypes } from '@/features/application/schemas/application';
import { initiateApplicantStkPush, verifyLatestApplicantPaymentNow } from '@/features/payments/actions/daraja';
import { interpretDarajaFailure } from '@/features/payments/lib/daraja-result';
import { cn } from '@/lib/utils';

type State = { error?: string; success?: string; fieldErrors?: Record<string, string[] | undefined> };
type Cat = { id: string; name: string; description: string | null };
type Revision = {
  rejectionReason?: string | null;
  reviewNotes?: string | null;
  flaggedSections: { id: string; label: string }[];
  flaggedFields: { id: string; label: string }[];
  requiresNewPaymentProof: boolean;
  resubmissionCount: number;
};
type PaymentConfiguration = {
  collectionMode: 'MANUAL_PROOF' | 'MPESA_DARAJA';
  applicationFee: number;
  includeRenewalFeeInApplication: boolean;
  bundledRenewalFee: number;
  baseAmount: number;
  isTaxEnabled: boolean;
  taxPercentage: number;
  applicationTaxAmount: number;
  renewalTaxAmount: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  manualPaymentInstructions: string | null;
  mpesaBusinessName: string | null;
  mpesaPaybillNumber: string | null;
  mpesaShortCode: string | null;
  darajaTransactionType: 'CustomerPayBillOnline' | 'CustomerBuyGoodsOnline';
};
type PaymentIntent = {
  status: 'CREATED' | 'AWAITING_PAYMENT' | 'VERIFIED' | 'FAILED' | 'CANCELLED' | 'EXPIRED' | 'LOCKED';
  payerPhoneNumber: string | null;
  baseAmount: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  accountReference: string;
  receiptNumber: string | null;
  checkoutRequestId: string | null;
  lastError: string | null;
  verifiedAt: string | null;
  lockedAt: string | null;
  createdAt: string;
  updatedAt: string;
} | null;
type LatestMpesaRequest = {
  status: 'INITIATED' | 'AWAITING_CALLBACK' | 'CALLBACK_RECEIVED' | 'SUCCESS' | 'VERIFIED' | 'FAILED' | 'CANCELLED' | 'TIMEOUT';
  payerPhoneNumber: string;
  amount: number;
  checkoutRequestId: string | null;
  receiptNumber: string | null;
  updatedAt: string;
  resultCode?: number | null;
  resultDesc: string | null;
  reconciliationAttemptCount: number;
  lastReconciledAt: string | null;
  lastReconciliationSource: string | null;
  lastReconciliationNote: string | null;
} | null;
type Props = {
  email: string;
  fullName?: string | null;
  initialDraft?: Record<string, unknown> | null;
  initialStep?: number;
  initialSavedAt?: string | null;
  revisionContext?: Revision | null;
  organizationName: string;
  membershipCategories: Cat[];
  paymentConfiguration: PaymentConfiguration;
  paymentIntent: PaymentIntent;
  latestMpesaRequest: LatestMpesaRequest;
};

type RequiredField = [string, number, string];

const init: State = {};
const steps = [
  { label: 'Membership', description: 'Membership choice' },
  { label: 'Payment', description: 'Fee details' },
  { label: 'Declaration', description: 'Signature and consent' },
  { label: 'Review', description: 'Check and submit' },
] as const;
const selectClassName =
  'flex h-11 w-full rounded-xl border border-slate-300/90 bg-white px-4 py-2.5 text-sm outline-none transition-all hover:border-slate-400 focus:border-[var(--brand)]';
const checkboxFields = ['declarationConfirmed', 'codeOfConductAccepted', 'dataProcessingConsent'] as const;
const baseRequiredFields: RequiredField[] = [
  ['membershipType', 0, 'Membership type'],
  ['membershipCategoryId', 0, 'Membership category'],
  ['digitalSignature', 2, 'Digital signature'],
  ['declarationDate', 2, 'Declaration date'],
  ['declarationConfirmed', 2, 'Declaration confirmation'],
  ['codeOfConductAccepted', 2, 'Code of conduct'],
  ['dataProcessingConsent', 2, 'Data consent'],
];
const manualPaymentFields: RequiredField[] = [
  ['paymentMethod', 1, 'Payment method'],
  ['transactionReferenceNumber', 1, 'Transaction reference'],
];
const darajaFields: RequiredField[] = [['payerPhoneNumber', 1, 'M-Pesa number']];
const paymentIntentLabels: Record<NonNullable<PaymentIntent>['status'], string> = {
  CREATED: 'Payment intent created',
  AWAITING_PAYMENT: 'Awaiting payment completion',
  VERIFIED: 'Payment verified and ready to attach',
  FAILED: 'Payment attempt failed',
  CANCELLED: 'Payment was cancelled',
  EXPIRED: 'Payment intent expired',
  LOCKED: 'Payment locked to your application',
};
const paymentIntentTone: Record<NonNullable<PaymentIntent>['status'], string> = {
  CREATED: 'border-slate-200 bg-slate-50 text-slate-700',
  AWAITING_PAYMENT: 'border-amber-200 bg-amber-50 text-amber-800',
  VERIFIED: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  FAILED: 'border-rose-200 bg-rose-50 text-rose-800',
  CANCELLED: 'border-rose-200 bg-rose-50 text-rose-800',
  EXPIRED: 'border-rose-200 bg-rose-50 text-rose-800',
  LOCKED: 'border-[var(--brand-border)] bg-[var(--brand-soft)] text-[var(--brand)]',
};

function InlineHelp({ text }: { text: string }) {
  return (
    <span title={text} className="ml-1 inline-flex align-middle text-slate-400 hover:text-slate-600">
      <CircleHelp className="h-3.5 w-3.5" />
    </span>
  );
}

function ErrorText({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <FieldError>{errors[0]}</FieldError>;
}

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button className="w-full rounded-xl" size="lg" type="submit" disabled={pending || disabled}>
      {pending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
      Submit application
    </Button>
  );
}

function hasValue(value: unknown) {
  return typeof value === 'string' ? value.trim().length > 0 : value === true;
}

function getDraftString(values: Record<string, unknown>, key: string) {
  return typeof values[key] === 'string' ? String(values[key]) : '';
}

function getDraftBoolean(values: Record<string, unknown>, key: string) {
  return values[key] === true;
}

function isSuccessfulMpesaStatus(status?: NonNullable<LatestMpesaRequest>['status'] | null) {
  return status === 'SUCCESS' || status === 'VERIFIED';
}

function canRetryMpesaRequest(status?: NonNullable<LatestMpesaRequest>['status'] | null) {
  return status === 'FAILED' || status === 'CANCELLED' || status === 'TIMEOUT';
}

function canVerifyMpesaRequest(status?: NonNullable<LatestMpesaRequest>['status'] | null) {
  return status === 'INITIATED' || status === 'AWAITING_CALLBACK' || status === 'CALLBACK_RECEIVED';
}

function buildRequiredFields(
  mode: PaymentConfiguration['collectionMode'],
  requiresPaymentProofUpload: boolean,
): RequiredField[] {
  return [
    ...baseRequiredFields,
    ...(mode === 'MANUAL_PROOF' ? manualPaymentFields : darajaFields),
    ...(requiresPaymentProofUpload ? [['paymentProof', 3, 'Payment proof'] satisfies RequiredField] : []),
  ];
}

function serializeFormValues(form: HTMLFormElement) {
  const formData = new FormData(form);
  const values: Record<string, unknown> = {};

  for (const [key, value] of formData.entries()) {
    if (value instanceof File) continue;
    values[key] = typeof value === 'string' ? value.trim() : value;
  }

  for (const field of checkboxFields) {
    if (!form.querySelector(`[name="${field}"]`)) continue;
    values[field] = formData.get(field) !== null;
  }

  return values;
}

function getMergedValues(form: HTMLFormElement | null, savedValues: Record<string, unknown>) {
  if (!form) return savedValues;
  return {
    ...savedValues,
    ...serializeFormValues(form),
  };
}

function hasSelectedFile(form: HTMLFormElement | null, fieldName: string) {
  if (!form) return false;
  const fileValue = new FormData(form).get(fieldName);
  return fileValue instanceof File && fileValue.size > 0;
}

function requiredMissing(
  form: HTMLFormElement | null,
  savedValues: Record<string, unknown>,
  mode: PaymentConfiguration['collectionMode'],
  latestMpesaRequest: LatestMpesaRequest,
  requiresPaymentProofUpload: boolean,
) {
  const required = buildRequiredFields(mode, requiresPaymentProofUpload);
  const values = getMergedValues(form, savedValues);
  const misses = required.filter(([field]) => {
    if (field === 'paymentProof') {
      return !hasSelectedFile(form, field);
    }
    return !hasValue(values[field]);
  });

  if (mode === 'MPESA_DARAJA' && !isSuccessfulMpesaStatus(latestMpesaRequest?.status)) {
    misses.push(['payerPhoneNumber', 1, 'Complete M-Pesa payment']);
  }

  return misses;
}

function progress(
  form: HTMLFormElement | null,
  savedValues: Record<string, unknown>,
  mode: PaymentConfiguration['collectionMode'],
  latestMpesaRequest: LatestMpesaRequest,
  requiresPaymentProofUpload: boolean,
) {
  const values = getMergedValues(form, savedValues);
  const required = buildRequiredFields(mode, requiresPaymentProofUpload);
  let completed = required.filter(([field]) => {
    if (field === 'paymentProof') return hasSelectedFile(form, field);
    return hasValue(values[field]);
  }).length;

  if (mode === 'MPESA_DARAJA' && isSuccessfulMpesaStatus(latestMpesaRequest?.status)) {
    completed += 1;
  }

  const total = required.length + (mode === 'MPESA_DARAJA' ? 1 : 0);
  return Math.round((completed / total) * 100);
}

function isStepReady(
  step: number,
  form: HTMLFormElement | null,
  savedValues: Record<string, unknown>,
  mode: PaymentConfiguration['collectionMode'],
  latestMpesaRequest: LatestMpesaRequest,
) {
  const values = getMergedValues(form, savedValues);

  if (step === 0) {
    return hasValue(values.membershipType) && hasValue(values.membershipCategoryId);
  }

  if (step === 1) {
    if (mode === 'MANUAL_PROOF') {
      return hasValue(values.paymentMethod) && hasValue(values.transactionReferenceNumber);
    }

    return hasValue(values.payerPhoneNumber) && isSuccessfulMpesaStatus(latestMpesaRequest?.status);
  }

  if (step === 2) {
    return (
      hasValue(values.digitalSignature) &&
      hasValue(values.declarationDate) &&
      values.declarationConfirmed === true &&
      values.codeOfConductAccepted === true &&
      values.dataProcessingConsent === true
    );
  }

  return true;
}

function getFlaggedFieldIdsForStep(step: number) {
  if (step === 0) return new Set(['membershipCategoryId']);
  if (step === 1) return new Set(['paymentProof', 'transactionReferenceNumber', 'payerPhoneNumber']);
  if (step === 2) return new Set(['digitalSignature']);
  return new Set(applicationReviewFieldOptions.map((field) => field.id));
}

function getValidationFieldsForStep(
  step: number,
  mode: PaymentConfiguration['collectionMode'],
) {
  if (step === 0) return ['membershipType', 'membershipCategoryId'];
  if (step === 1) {
    return mode === 'MANUAL_PROOF'
      ? ['paymentMethod', 'transactionReferenceNumber']
      : ['payerPhoneNumber'];
  }
  if (step === 2) {
    return ['digitalSignature', 'declarationDate', 'declarationConfirmed', 'codeOfConductAccepted', 'dataProcessingConsent'];
  }
  return ['paymentProof', ...baseRequiredFields.map(([field]) => field), ...(mode === 'MANUAL_PROOF' ? ['paymentMethod', 'transactionReferenceNumber'] : ['payerPhoneNumber'])];
}

export function ApplicationRegisterForm({
  email,
  fullName,
  initialDraft,
  initialStep = 0,
  initialSavedAt = null,
  revisionContext = null,
  organizationName,
  membershipCategories,
  paymentConfiguration,
  paymentIntent,
  latestMpesaRequest,
}: Props) {
  const router = useRouter();
  const mappedInitialStep = Math.max(0, Math.min(steps.length - 1, initialStep));
  const [draftValues, setDraftValues] = useState<Record<string, unknown>>(initialDraft ?? {});
  const [step, setStep] = useState(mappedInitialStep);
  const [furthestUnlockedStep, setFurthestUnlockedStep] = useState(mappedInitialStep);
  const [saved, setSaved] = useState<string | null>(initialSavedAt);
  const [status, setStatus] = useState<string | null>(
    getDraftString(initialDraft ?? {}, 'membershipCategoryId') ? 'Draft loaded' : null,
  );
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftPending, setDraftPending] = useState(false);
  const [stepFieldErrors, setStepFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [currentStepReady, setCurrentStepReady] = useState(false);
  const [mpesaState, setMpesaState] = useState<State & { checkoutRequestId?: string }>({});
  const [currentMpesaRequest, setCurrentMpesaRequest] = useState<LatestMpesaRequest>(latestMpesaRequest);
  const [currentPaymentIntent, setCurrentPaymentIntent] = useState<PaymentIntent>(paymentIntent);
  const [verificationNote, setVerificationNote] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [state, action] = useActionState<State, FormData>(submitApplication, init);
  const formRef = useRef<HTMLFormElement>(null);
  const focusNextStepRef = useRef(false);
  const previousApplicantStatusRef = useRef<NonNullable<LatestMpesaRequest>['status'] | null>(latestMpesaRequest?.status ?? null);
  const requiresPaymentProofUpload =
    paymentConfiguration.collectionMode === 'MANUAL_PROOF' && (revisionContext?.requiresNewPaymentProof ?? true);

  const profileSectionIds = new Set([
    'personal-location',
    'contact-next-of-kin',
    'professional-profile',
    'education-licensing',
    'membership-referees',
  ]);
  const profileFieldIds = new Set(['idNumber', 'countyCode', 'phoneNumber']);
  const profileFlagged = Boolean(
    revisionContext?.flaggedSections.some((section) => profileSectionIds.has(section.id)) ||
      revisionContext?.flaggedFields.some((field) => profileFieldIds.has(field.id)),
  );
  const flaggedFieldIdsForStep = getFlaggedFieldIdsForStep(step);
  const currentStepFlaggedSection =
    step > 0 ? revisionContext?.flaggedSections.find((section) => section.id === 'payment-declaration') ?? null : null;
  const currentStepFlaggedFields =
    revisionContext?.flaggedFields.filter((field) => flaggedFieldIdsForStep.has(field.id)) ?? [];
  const missingItems = requiredMissing(
    formRef.current,
    draftValues,
    paymentConfiguration.collectionMode,
    currentMpesaRequest,
    requiresPaymentProofUpload,
  );
  const ready = missingItems.length === 0;
  const completion = progress(
    formRef.current,
    draftValues,
    paymentConfiguration.collectionMode,
    currentMpesaRequest,
    requiresPaymentProofUpload,
  );
  const selectedMembershipCategory = membershipCategories.find(
    (category) => category.id === getDraftString(getMergedValues(formRef.current, draftValues), 'membershipCategoryId'),
  );
  const displayFieldErrors = stepFieldErrors;
  const currentStepHasBlockingErrors = getValidationFieldsForStep(step, paymentConfiguration.collectionMode)
    .some((field) => (displayFieldErrors[field]?.length ?? 0) > 0);

  function refreshStepReady() {
    setCurrentStepReady(
      isStepReady(step, formRef.current, draftValues, paymentConfiguration.collectionMode, currentMpesaRequest),
    );
  }

  function handleFormInteraction(event: FormEvent<HTMLFormElement>) {
    setStatus(null);
    setDraftError(null);
    refreshStepReady();

    const target = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
    const fieldName = target?.name;

    if (!fieldName) return;

    setStepFieldErrors((current) => {
      if (!current[fieldName]) return current;
      const next = { ...current };
      delete next[fieldName];
      return next;
    });
  }

  useEffect(() => {
    refreshStepReady();
  }, [step, draftValues, currentMpesaRequest, paymentConfiguration.collectionMode]);

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) {
      toast.success(state.success);
      router.push('/dashboard');
      router.refresh();
    }
  }, [router, state.error, state.success]);

  useEffect(() => {
    if (!focusNextStepRef.current || !formRef.current) return;
    focusNextStepRef.current = false;
    const form = formRef.current;

    requestAnimationFrame(() => {
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const firstField = form.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])',
      );
      firstField?.focus();
    });
  }, [step]);

  useEffect(() => {
    if (paymentConfiguration.collectionMode !== 'MPESA_DARAJA') return;

    const stream = new EventSource('/api/payments/mpesa/status/stream?scope=applicant');

    stream.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as {
          latestRequest?: LatestMpesaRequest;
          paymentIntent?: PaymentIntent;
        };

        if (typeof payload.latestRequest !== 'undefined') {
          setCurrentMpesaRequest(payload.latestRequest ?? null);

          const nextStatus = payload.latestRequest?.status ?? null;
          const previousStatus = previousApplicantStatusRef.current;

          if (nextStatus && nextStatus !== previousStatus) {
            if (nextStatus === 'SUCCESS' || nextStatus === 'VERIFIED') {
              setVerificationNote({ tone: 'success', message: 'Payment confirmed successfully.' });
            } else if (nextStatus === 'FAILED' || nextStatus === 'CANCELLED' || nextStatus === 'TIMEOUT') {
              setVerificationNote({
                tone: 'error',
                message: payload.latestRequest?.resultDesc ?? 'The payment attempt did not complete successfully.',
              });
            }
          }

          previousApplicantStatusRef.current = nextStatus;
        }

        if (typeof payload.paymentIntent !== 'undefined') {
          setCurrentPaymentIntent(payload.paymentIntent ?? null);
        }
      } catch {
        // Ignore malformed stream payloads and keep the current UI state.
      }
    };

    return () => {
      stream.close();
    };
  }, [paymentConfiguration.collectionMode]);

  useEffect(() => {
    if (!verificationNote) return;

    const timeoutId = window.setTimeout(() => {
      setVerificationNote(null);
    }, 8000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [verificationNote]);

  useEffect(() => {
    if (paymentConfiguration.collectionMode !== 'MPESA_DARAJA' || !isSuccessfulMpesaStatus(currentMpesaRequest?.status)) {
      return;
    }

    setStepFieldErrors((current) => {
      if (!current.payerPhoneNumber) return current;
      const next = { ...current };
      delete next.payerPhoneNumber;
      return next;
    });
  }, [currentMpesaRequest?.status, paymentConfiguration.collectionMode]);

  async function persist(nextStep: number) {
    if (!formRef.current) return;

    setDraftPending(true);
    setDraftError(null);
    setStepFieldErrors({});

    const payload = new FormData(formRef.current);
    payload.set('currentStep', String(step));
    payload.set('nextStep', String(nextStep));

    try {
      const result = await saveApplicationDraft(payload);

      if (result.error) {
        setDraftError(result.error);
        setStepFieldErrors(result.fieldErrors ?? {});
        if (typeof result.step === 'number') {
          setStep(result.step);
        }
        toast.error(result.error);
        return;
      }

      const nextValues = getMergedValues(formRef.current, draftValues);
      setDraftValues(nextValues);
      setStepFieldErrors({});
      setSaved(result.savedAt ?? null);
      setStatus('Draft saved');
      setFurthestUnlockedStep((current) => Math.max(current, nextStep));
      if (nextStep !== step) {
        focusNextStepRef.current = true;
        setStep(nextStep);
      }
    } catch {
      setDraftError('Unable to save your draft right now.');
      toast.error('Unable to save your draft right now.');
    } finally {
      setDraftPending(false);
    }
  }

  async function triggerStkPush() {
    if (!formRef.current) return;

    const payload = new FormData();
    payload.set('payerPhoneNumber', String(new FormData(formRef.current).get('payerPhoneNumber') ?? ''));

    const result = await initiateApplicantStkPush({}, payload);
    setVerificationNote(null);
    setMpesaState(result);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    if ('success' in result && result.success) toast.success(result.success);

    const now = new Date().toISOString();
    const payerPhoneNumber = String(payload.get('payerPhoneNumber') ?? '');
    setDraftValues((current) => ({ ...current, payerPhoneNumber, paymentMethod: 'MPESA' }));
    setCurrentMpesaRequest({
      status: 'AWAITING_CALLBACK',
      payerPhoneNumber,
      amount: paymentConfiguration.totalAmount,
      checkoutRequestId: result.checkoutRequestId ?? null,
      receiptNumber: null,
      updatedAt: now,
      resultCode: null,
      resultDesc: null,
      reconciliationAttemptCount: 0,
      lastReconciledAt: null,
      lastReconciliationSource: 'MANUAL_VERIFY',
      lastReconciliationNote: 'STK push submitted. Waiting for callback or verification query.',
    });
    setCurrentPaymentIntent({
      status: 'AWAITING_PAYMENT',
      payerPhoneNumber,
      baseAmount: paymentConfiguration.baseAmount,
      taxAmount: paymentConfiguration.taxAmount,
      totalAmount: paymentConfiguration.totalAmount,
      currency: paymentConfiguration.currency,
      accountReference: `${paymentConfiguration.mpesaBusinessName ?? organizationName} payment`,
      receiptNumber: null,
      checkoutRequestId: result.checkoutRequestId ?? null,
      lastError: null,
      verifiedAt: null,
      lockedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    refreshStepReady();
  }

  async function refreshMpesaRequest() {
    const response = await fetch('/api/payments/mpesa/status?scope=applicant', {
      cache: 'no-store',
      credentials: 'same-origin',
    });

    if (!response.ok) return;

    const data = (await response.json()) as {
      latestRequest?: LatestMpesaRequest;
      paymentIntent?: PaymentIntent;
    };

    if (typeof data.latestRequest !== 'undefined') {
      setCurrentMpesaRequest(data.latestRequest ?? null);
      if (isSuccessfulMpesaStatus(data.latestRequest?.status)) {
        setVerificationNote({ tone: 'success', message: 'Payment confirmed successfully.' });
      }
    }

    if (typeof data.paymentIntent !== 'undefined') {
      setCurrentPaymentIntent(data.paymentIntent ?? null);
    }
  }

  async function verifyPaymentNow() {
    const result = await verifyLatestApplicantPaymentNow();

    if (result.error) {
      setVerificationNote({ tone: 'error', message: result.error });
      toast.error(result.error);
      return;
    }

    if ('success' in result && result.success) {
      setVerificationNote({ tone: 'success', message: result.success });
      toast.success(result.success);
    }

    await refreshMpesaRequest();
  }

  return (
    <div className="space-y-8">
      {revisionContext ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50/80 p-5 text-sm text-slate-700">
          <p className="font-semibold text-rose-700">Your last application was rejected. Update the flagged details and resubmit.</p>
          {revisionContext.rejectionReason ? (
            <p className="mt-2">
              <span className="font-medium">Reason:</span> {revisionContext.rejectionReason}
            </p>
          ) : null}
          {revisionContext.reviewNotes ? (
            <p className="mt-2">
              <span className="font-medium">Reviewer notes:</span> {revisionContext.reviewNotes}
            </p>
          ) : null}
          <p className="mt-2">
            {revisionContext.requiresNewPaymentProof
              ? 'A new payment proof is required for this resubmission.'
              : 'Your existing proof will be reused unless the reviewer asked you to replace it.'}
          </p>
        </div>
      ) : null}

      {profileFlagged ? (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-semibold">The reviewer flagged some profile details.</p>
          <p className="mt-2">Open your profile, correct the saved identity or contact details, then come back here to submit again.</p>
          <div className="mt-3">
            <Link
              href="/profile"
              className="inline-flex items-center rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100"
            >
              <UserRoundPen className="mr-2 h-4 w-4" />
              Update profile
            </Link>
          </div>
        </div>
      ) : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-950">Application setup</p>
            <p className="mt-1 text-sm text-slate-600">Save each section before moving forward.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              Step {step + 1} of {steps.length}
            </span>
            <span className="font-medium text-[var(--brand)]">{completion}% complete</span>
          </div>
        </div>

        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-[var(--brand)] transition-[width]" style={{ width: `${completion}%` }} />
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {steps.map((item, index) => {
            const active = index === step;
            const savedStep = index < furthestUnlockedStep;
            const locked = index > furthestUnlockedStep;

            return (
              <button
                key={item.label}
                type="button"
                disabled={locked || draftPending}
                onClick={() => setStep(index)}
                className={cn(
                  'rounded-2xl border px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                  active ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-slate-950' : 'border-slate-200 bg-white text-slate-600',
                  !active && !locked ? 'hover:border-slate-300' : '',
                )}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">
                  {savedStep ? 'Saved' : `Step ${index + 1}`}
                </p>
                <p className="mt-2 text-sm font-semibold">{item.label}</p>
                <p className="mt-1 text-xs text-slate-500">{item.description}</p>
              </button>
            );
          })}
        </div>
      </section>

      {currentStepFlaggedSection || currentStepFlaggedFields.length > 0 ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
          <p className="font-semibold">This step has items flagged by the reviewer.</p>
          {currentStepFlaggedSection ? <p className="mt-2">Section: {currentStepFlaggedSection.label}</p> : null}
          {currentStepFlaggedFields.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {currentStepFlaggedFields.map((field) => (
                <span key={field.id} className="rounded-full border border-rose-200 bg-white px-3 py-1 text-xs font-medium text-rose-700">
                  {field.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <form
        ref={formRef}
        action={action}
        className="space-y-6"
        onInputCapture={handleFormInteraction}
        onChangeCapture={handleFormInteraction}
      >
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="currentStep" value={step} readOnly />
        <input type="hidden" name="paymentCollectionMode" value={paymentConfiguration.collectionMode} />
        {paymentConfiguration.collectionMode === 'MPESA_DARAJA' ? <input type="hidden" name="paymentMethod" value="MPESA" /> : null}

        {step === 0 ? (
          <section className="grid gap-5 rounded-3xl border border-slate-200 bg-white p-6 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">Membership</p>
              <h3 className="text-xl font-semibold text-slate-950">Choose the application type</h3>
              <p className="text-sm leading-6 text-slate-600">Pick the membership option you want this application to use.</p>
            </div>

            <Field>
              <FieldLabel htmlFor="membershipType" required>
                Membership type
              </FieldLabel>
              <select
                id="membershipType"
                name="membershipType"
                className={selectClassName}
                defaultValue={getDraftString(draftValues, 'membershipType') || 'NEW_APPLICATION'}
                required
              >
                {membershipTypes.map((option) => (
                  <option key={option} value={option}>
                    {option.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
              <ErrorText errors={displayFieldErrors.membershipType} />
            </Field>

            <Field>
              <FieldLabel htmlFor="membershipCategoryId" required>
                Membership category
              </FieldLabel>
              <select
                id="membershipCategoryId"
                name="membershipCategoryId"
                className={selectClassName}
                defaultValue={getDraftString(draftValues, 'membershipCategoryId')}
                required
              >
                <option value="">Select membership category</option>
                {membershipCategories.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
              <ErrorText errors={displayFieldErrors.membershipCategoryId} />
            </Field>

            {selectedMembershipCategory ? (
              <div className="sm:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
                <p className="font-medium text-slate-900">{selectedMembershipCategory.name}</p>
                {selectedMembershipCategory.description ? (
                  <p className="mt-2">{selectedMembershipCategory.description}</p>
                ) : (
                  <p className="mt-2">This category will be attached to the application you submit.</p>
                )}
              </div>
            ) : null}
          </section>
        ) : null}

        {step === 1 ? (
          <section className="grid gap-5 rounded-3xl border border-slate-200 bg-white p-6 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">Payment</p>
              <h3 className="text-xl font-semibold text-slate-950">Application fee</h3>
              <p className="text-sm leading-6 text-slate-600">Confirm the payment details, then save and continue.</p>
            </div>

            <Card className="sm:col-span-2 rounded-3xl border-[color:var(--border-soft)] bg-slate-50/70 shadow-none">
              <CardContent className="space-y-4 p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-950">Payment summary</p>
                    <p className="text-sm text-slate-600">
                      {paymentConfiguration.collectionMode === 'MPESA_DARAJA'
                        ? paymentConfiguration.includeRenewalFeeInApplication
                          ? 'Enter your Safaricom number, trigger the STK prompt, then confirm the bundled registration payment here.'
                          : 'Enter your Safaricom number, trigger the STK prompt, then confirm the payment status here.'
                        : 'Pay first using your preferred channel, then keep the transaction reference ready for this form.'}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      'w-fit rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]',
                      paymentConfiguration.collectionMode === 'MPESA_DARAJA'
                        ? 'border-[var(--brand-border)] bg-[var(--brand-soft)] text-[var(--brand)]'
                        : 'border-slate-200 bg-white text-slate-700',
                    )}
                  >
                    {paymentConfiguration.collectionMode === 'MPESA_DARAJA' ? 'M-Pesa paybill' : 'Manual proof'}
                  </Badge>
                </div>

                <div className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2 xl:grid-cols-3">
                  <p><span className="font-medium text-slate-950">Application fee:</span> {paymentConfiguration.currency} {paymentConfiguration.applicationFee.toLocaleString()}</p>
                  {paymentConfiguration.includeRenewalFeeInApplication ? (
                    <p><span className="font-medium text-slate-950">First renewal fee:</span> {paymentConfiguration.currency} {paymentConfiguration.bundledRenewalFee.toLocaleString()}</p>
                  ) : null}
                  <p>
                    <span className="font-medium text-slate-950">Tax:</span>{' '}
                    {paymentConfiguration.isTaxEnabled
                      ? `${paymentConfiguration.currency} ${paymentConfiguration.taxAmount.toLocaleString()} (${paymentConfiguration.taxPercentage}%)`
                      : 'Not applied'}
                  </p>
                  <p><span className="font-medium text-slate-950">Total due:</span> {paymentConfiguration.currency} {paymentConfiguration.totalAmount.toLocaleString()}</p>
                </div>

                {paymentConfiguration.collectionMode === 'MPESA_DARAJA' ? (
                  <>
                    <Separator className="bg-slate-200" />
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-slate-950">Paybill details</p>
                        <p className="text-sm text-slate-600">Use these details to verify the prompt is going to the right merchant account.</p>
                      </div>
                      <Badge variant="outline" className="w-fit rounded-full border-[var(--brand-border)] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--brand)]">
                        STK enabled
                      </Badge>
                    </div>
                    <div className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2 xl:grid-cols-3">
                      <p><span className="font-medium text-slate-950">Paybill:</span> {paymentConfiguration.mpesaPaybillNumber ?? paymentConfiguration.mpesaShortCode ?? 'Not configured'}</p>
                      <p><span className="font-medium text-slate-950">Business:</span> {paymentConfiguration.mpesaBusinessName ?? 'Not configured'}</p>
                    </div>
                  </>
                ) : null}
              </CardContent>
            </Card>

            {paymentConfiguration.collectionMode === 'MANUAL_PROOF' ? (
              <>
                <Card className="sm:col-span-2 rounded-3xl border-[color:var(--border-soft)] bg-slate-50/80 shadow-none">
                  <CardHeader className="p-5 pb-3">
                    <CardTitle className="text-base font-semibold text-slate-950">How to pay</CardTitle>
                    <CardDescription>
                      {paymentConfiguration.manualPaymentInstructions || 'Pay the application fee, enter the transaction reference, then upload proof on the review step.'}
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Field>
                  <FieldLabel htmlFor="paymentMethod" required>
                    Payment method
                  </FieldLabel>
                  <select
                    id="paymentMethod"
                    name="paymentMethod"
                    className={selectClassName}
                    defaultValue={getDraftString(draftValues, 'paymentMethod') || 'MPESA'}
                    required
                  >
                    <option value="MPESA">M-Pesa</option>
                    <option value="BANK_TRANSFER">Bank transfer</option>
                    <option value="CARD">Card</option>
                  </select>
                  <ErrorText errors={displayFieldErrors.paymentMethod} />
                </Field>

                <Field>
                  <FieldLabel htmlFor="transactionReferenceNumber" required>
                    Transaction reference
                  </FieldLabel>
                  <Input
                    id="transactionReferenceNumber"
                    name="transactionReferenceNumber"
                    defaultValue={getDraftString(draftValues, 'transactionReferenceNumber')}
                    placeholder="e.g. QKX83JY92"
                    required
                  />
                  <FieldDescription>Use the exact reference from the payment.</FieldDescription>
                  <ErrorText errors={displayFieldErrors.transactionReferenceNumber} />
                </Field>
              </>
            ) : (
              <>
                <div className="sm:col-span-2 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
                  <Field className="space-y-2">
                    <FieldLabel htmlFor="payerPhoneNumber" required>
                      Safaricom number
                    </FieldLabel>
                    <Input
                      id="payerPhoneNumber"
                      name="payerPhoneNumber"
                      defaultValue={
                        currentPaymentIntent?.payerPhoneNumber ??
                        currentMpesaRequest?.payerPhoneNumber ??
                        getDraftString(draftValues, 'payerPhoneNumber')
                      }
                      placeholder="2547XXXXXXXX"
                      required
                    />
                    <FieldDescription>This is the number that will receive the STK prompt.</FieldDescription>
                    <ErrorText errors={displayFieldErrors.payerPhoneNumber || mpesaState.fieldErrors?.phoneNumber} />
                  </Field>

                  <div className="flex flex-wrap gap-3 md:pt-7">
                    <Button type="button" onClick={() => void triggerStkPush()}>
                      <Smartphone className="mr-2 h-4 w-4" />
                      {canRetryMpesaRequest(currentMpesaRequest?.status) ? 'Retry STK push' : 'Start STK push'}
                    </Button>
                    {canVerifyMpesaRequest(currentMpesaRequest?.status) ? (
                      <Button type="button" variant="outline" onClick={() => void verifyPaymentNow()}>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Verify payment
                      </Button>
                    ) : null}
                  </div>
                </div>

                {verificationNote ? (
                  <Alert
                    className={cn(
                      'sm:col-span-2 rounded-2xl',
                      verificationNote.tone === 'error'
                        ? 'border-rose-200 bg-rose-50 text-rose-700'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-700',
                    )}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertTitle>{verificationNote.tone === 'error' ? 'Payment update' : 'Payment confirmed'}</AlertTitle>
                    <AlertDescription>{verificationNote.message}</AlertDescription>
                  </Alert>
                ) : null}

                <Card
                  className={cn(
                    'sm:col-span-2 rounded-3xl shadow-none',
                    currentPaymentIntent ? paymentIntentTone[currentPaymentIntent.status] : 'border-slate-200 bg-white text-slate-700',
                  )}
                >
                  <CardHeader className="flex flex-col gap-3 p-5 pb-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-base font-semibold text-slate-950">Payment status</CardTitle>
                      <CardDescription className="text-current/80">
                        {currentPaymentIntent ? paymentIntentLabels[currentPaymentIntent.status] : 'No payment request has started yet.'}
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="rounded-full border-current/15 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-current">
                      {currentMpesaRequest?.status ?? 'Not started'}
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-4 p-5 pt-0">
                    <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-700">
                      <p><span className="font-medium text-slate-950">Amount:</span> {paymentConfiguration.currency} {paymentConfiguration.totalAmount.toLocaleString()}</p>
                      <p><span className="font-medium text-slate-950">Phone:</span> {currentPaymentIntent?.payerPhoneNumber ?? currentMpesaRequest?.payerPhoneNumber ?? 'Not provided'}</p>
                      <p><span className="font-medium text-slate-950">Receipt:</span> {currentPaymentIntent?.receiptNumber ?? currentMpesaRequest?.receiptNumber ?? 'Pending'}</p>
                      <p className="min-w-0"><span className="font-medium text-slate-950">Reference:</span> <span className="break-all">{currentPaymentIntent?.checkoutRequestId ?? currentMpesaRequest?.checkoutRequestId ?? 'Pending'}</span></p>
                    </div>

                    {currentMpesaRequest ? (
                      (() => {
                        const failure = interpretDarajaFailure(
                          currentMpesaRequest.resultCode ?? null,
                          currentMpesaRequest.resultDesc,
                          currentMpesaRequest.status,
                        );

                        return currentMpesaRequest.status === 'SUCCESS' || currentMpesaRequest.status === 'VERIFIED' ? null : (
                          <>
                            <Separator className="bg-current/10" />
                            <div className="space-y-1 text-sm">
                              <p className="font-medium text-slate-950">{failure.label}</p>
                              <p>{failure.detail}</p>
                              {failure.guidance ? <p className="text-slate-600">{failure.guidance}</p> : null}
                            </div>
                          </>
                        );
                      })()
                    ) : null}

                    {currentPaymentIntent?.lastError ? (
                      <>
                        <Separator className="bg-current/10" />
                        <p className="text-sm">{currentPaymentIntent.lastError}</p>
                      </>
                    ) : null}
                  </CardContent>
                </Card>
              </>
            )}
          </section>
        ) : null}

        {step === 2 ? (
          <section className="grid gap-5 rounded-3xl border border-slate-200 bg-white p-6 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">Declaration</p>
              <h3 className="text-xl font-semibold text-slate-950">Declaration and electronic signature</h3>
              <p className="text-sm leading-6 text-slate-600">Review the declaration carefully. Your full legal name below will be treated as your electronic signature when you submit.</p>
            </div>

            <div className="sm:col-span-2 rounded-[28px] border border-slate-200 bg-slate-50/80 p-5 text-sm leading-6 text-slate-700">
              <p className="font-medium text-slate-950">Applicant declaration</p>
              <p className="mt-2">
                I declare that the information in my saved profile and this application is true, complete, and submitted by me.
                I understand that entering my full legal name below acts as my electronic signature for this submission.
              </p>
            </div>

            <Field className={cn('sm:col-span-2', currentStepFlaggedFields.some((field) => field.id === 'digitalSignature') ? 'rounded-2xl ring-2 ring-rose-200 ring-offset-2 ring-offset-white' : '')}>
              <FieldLabel htmlFor="digitalSignature" required>
                Full legal name
              </FieldLabel>
              <Input
                id="digitalSignature"
                name="digitalSignature"
                defaultValue={getDraftString(draftValues, 'digitalSignature') || fullName || ''}
                placeholder="Type your full legal name"
                required
              />
              <FieldDescription>Submitting this form with your name here acts as your electronic signature.</FieldDescription>
              <ErrorText errors={displayFieldErrors.digitalSignature} />
            </Field>

            <Field>
              <FieldLabel htmlFor="declarationDate" required>
                Declaration date
              </FieldLabel>
              <Input
                id="declarationDate"
                name="declarationDate"
                type="date"
                defaultValue={getDraftString(draftValues, 'declarationDate') || new Date().toISOString().slice(0, 10)}
                required
              />
              <FieldDescription>Use the date you are making this declaration.</FieldDescription>
              <ErrorText errors={displayFieldErrors.declarationDate} />
            </Field>

            <div className="sm:col-span-2 rounded-[24px] border border-[var(--brand-border)] bg-[var(--brand-soft)] px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand)]">Signature summary</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/80 bg-white/80 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Signed by</p>
                  <p className="mt-1.5 text-sm font-semibold text-slate-950">
                    {getDraftString(getMergedValues(formRef.current, draftValues), 'digitalSignature') || fullName || 'Enter your full legal name below'}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/80 bg-white/80 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Declaration date</p>
                  <p className="mt-1.5 text-sm font-semibold text-slate-950">
                    {getDraftString(getMergedValues(formRef.current, draftValues), 'declarationDate') || new Date().toISOString().slice(0, 10)}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3 sm:col-span-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-[24px] border border-slate-200 bg-slate-50/80 p-4 transition hover:border-slate-300 hover:bg-slate-50">
                <input
                  type="checkbox"
                  name="declarationConfirmed"
                  defaultChecked={getDraftBoolean(draftValues, 'declarationConfirmed')}
                  required
                  className="mt-1 h-4 w-4 rounded border-slate-300 accent-[var(--brand)]"
                />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-950">Accuracy confirmation</p>
                  <p className="text-sm leading-6 text-slate-600">I confirm that the saved profile details and all information in this application are accurate.</p>
                </div>
              </label>
              <ErrorText errors={displayFieldErrors.declarationConfirmed} />

              <label className="flex cursor-pointer items-start gap-3 rounded-[24px] border border-slate-200 bg-slate-50/80 p-4 transition hover:border-slate-300 hover:bg-slate-50">
                <input
                  type="checkbox"
                  name="codeOfConductAccepted"
                  defaultChecked={getDraftBoolean(draftValues, 'codeOfConductAccepted')}
                  required
                  className="mt-1 h-4 w-4 rounded border-slate-300 accent-[var(--brand)]"
                />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-950">Code of conduct</p>
                  <p className="text-sm leading-6 text-slate-600">I agree to follow the organisation's code of conduct as part of my application and membership obligations.</p>
                </div>
              </label>
              <ErrorText errors={displayFieldErrors.codeOfConductAccepted} />

              <label className="flex cursor-pointer items-start gap-3 rounded-[24px] border border-slate-200 bg-slate-50/80 p-4 transition hover:border-slate-300 hover:bg-slate-50">
                <input
                  type="checkbox"
                  name="dataProcessingConsent"
                  defaultChecked={getDraftBoolean(draftValues, 'dataProcessingConsent')}
                  required
                  className="mt-1 h-4 w-4 rounded border-slate-300 accent-[var(--brand)]"
                />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-950">Data processing consent</p>
                  <p className="text-sm leading-6 text-slate-600">I consent to the processing of my personal data for membership administration, records, and related organisational communication.</p>
                </div>
              </label>
              <ErrorText errors={displayFieldErrors.dataProcessingConsent} />
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="space-y-5 rounded-[32px] border border-slate-200 bg-white p-6">
            <div className="rounded-[28px] border border-slate-200 bg-slate-50/70 p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">Review</p>
                  <h3 className="text-xl font-semibold text-slate-950">Final review before submission</h3>
                  <p className="max-w-2xl text-sm leading-6 text-slate-600">Check the summary below, confirm the payment and declaration details, then submit once everything looks correct.</p>
                </div>
                <Badge variant="outline" className="w-fit rounded-full border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700">
                  {ready ? 'Ready to submit' : 'Needs review'}
                </Badge>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
              <Card className="rounded-[28px] border-[color:var(--border-soft)] bg-white shadow-none">
                <CardHeader className="p-5 pb-4">
                  <CardTitle className="text-base font-semibold text-slate-950">Application summary</CardTitle>
                  <CardDescription>The main details that will be attached to this submission.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 p-5 pt-0 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Membership type</p>
                    <p className="mt-1.5 text-sm font-semibold text-slate-900">
                      {getDraftString(getMergedValues(formRef.current, draftValues), 'membershipType').replaceAll('_', ' ') || 'Not selected'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,#fff,#f8fafc)] px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Membership category</p>
                    <p className="mt-1.5 text-sm font-semibold text-slate-900">{selectedMembershipCategory?.name ?? 'Not selected'}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,#fff,#f8fafc)] px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Payment mode</p>
                    <p className="mt-1.5 text-sm font-semibold text-slate-900">
                      {paymentConfiguration.collectionMode === 'MPESA_DARAJA' ? 'M-Pesa paybill prompt' : 'Manual proof upload'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Amount due</p>
                    <p className="mt-1.5 text-sm font-semibold text-slate-900">
                      {paymentConfiguration.currency} {paymentConfiguration.totalAmount.toLocaleString()}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-[28px] border-[color:var(--border-soft)] bg-white shadow-none">
                <CardHeader className="p-5 pb-4">
                  <CardTitle className="text-base font-semibold text-slate-950">Submission readiness</CardTitle>
                  <CardDescription>What will be recorded when you submit.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 p-5 pt-0 text-sm text-slate-700">
                  {paymentConfiguration.collectionMode === 'MANUAL_PROOF' ? (
                    <Field className={cn(currentStepFlaggedFields.some((field) => field.id === 'paymentProof') ? 'rounded-2xl ring-2 ring-rose-200 ring-offset-2 ring-offset-white' : '')}>
                      <FieldLabel htmlFor="paymentProof" required={requiresPaymentProofUpload}>
                        Upload proof of payment
                      </FieldLabel>
                      <Input
                        id="paymentProof"
                        name="paymentProof"
                        type="file"
                        accept=".pdf,image/png,image/jpeg,image/webp"
                        required={requiresPaymentProofUpload}
                      />
                      <FieldDescription>
                        {revisionContext?.requiresNewPaymentProof
                          ? 'Upload a fresh payment proof for this revision.'
                          : 'Upload proof now if this is a new application. Existing proof is reused unless the reviewer asked for a replacement.'}
                      </FieldDescription>
                      <ErrorText errors={displayFieldErrors.paymentProof} />
                    </Field>
                  ) : (
                    <div className={cn(
                      'rounded-2xl border px-4 py-4',
                      isSuccessfulMpesaStatus(currentMpesaRequest?.status)
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : 'border-amber-200 bg-amber-50 text-amber-900',
                    )}>
                      <p className="font-semibold">
                        {isSuccessfulMpesaStatus(currentMpesaRequest?.status)
                          ? 'M-Pesa payment is verified and ready to attach.'
                          : 'Complete the M-Pesa confirmation before submitting.'}
                      </p>
                      <p className="mt-1 leading-6">
                        {isSuccessfulMpesaStatus(currentMpesaRequest?.status)
                          ? 'The verified payment will be locked to this application when you submit.'
                          : 'Go back to the Payment step and finish the payment confirmation first.'}
                      </p>
                    </div>
                  )}

                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Electronic signature</p>
                    <p className="mt-1.5 text-sm font-semibold text-slate-950">
                      {getDraftString(getMergedValues(formRef.current, draftValues), 'digitalSignature') || fullName || 'No signature name entered yet'}
                    </p>
                    <p className="mt-1 text-slate-600">This name will be recorded as the electronic signature for the submission.</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {!ready && missingItems.length > 0 ? (
              <div className="rounded-[24px] border border-amber-200 bg-amber-50/70 p-5 text-sm text-amber-900">
                <p className="font-semibold">A few items still need attention before submission.</p>
                <p className="mt-1 text-amber-800">Use these shortcuts to jump back to the relevant step.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {missingItems.map(([field, section, label], index) => (
                    <button
                      key={`${String(field)}-${section}-${index}`}
                      type="button"
                      onClick={() => setStep(section)}
                      className="rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 transition hover:bg-amber-100"
                    >
                      {label} · Step {section + 1}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-[24px] border border-emerald-200 bg-emerald-50/70 px-4 py-4 text-sm text-emerald-800">
                <p className="font-semibold">Everything required for submission is in place.</p>
                <p className="mt-1">You can submit this application now.</p>
              </div>
            )}
          </section>
        ) : null}

        {draftError ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{draftError}</div> : null}
        {state.error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{state.error}</div> : null}
        {state.success ? <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-soft)] p-4 text-sm text-[var(--brand)]">{state.success}</div> : null}

        <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            onClick={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0 || draftPending}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>

          {step < steps.length - 1 ? (
            <Button
              type="button"
              size="lg"
              className="rounded-xl"
              disabled={!currentStepReady || currentStepHasBlockingErrors || draftPending}
              onClick={() => void persist(step + 1)}
            >
              {draftPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
              Save and continue
            </Button>
          ) : (
            <div className="sm:w-64">
              <Submit disabled={!ready || draftPending} />
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
