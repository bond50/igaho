'use client';

import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Settings2,
  ShieldCheck,
  Tags,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  deleteMembershipCategory,
  saveApplicationPortalSetting,
  saveMembershipCategory,
  setMembershipCategoryStatus,
  type SettingsActionState,
} from '@/features/application/actions/settings';
import type { PaymentConfiguration, PortalReadinessIssue } from '@/features/application/queries/settings';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type MembershipCategoryItem = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  displayOrder: number;
  _count: {
    applications: number;
  };
};

type PortalSettingItem = {
  setupName: string | null;
  shortName: string | null;
  isFormOpen: boolean;
  isAcceptingApplications: boolean;
  showApplicationFormAfterApproval: boolean;
  applicationReviewMode: 'MANUAL_REVIEW' | 'AUTO_APPROVE_VERIFIED_PAYMENTS';
  renewalsEnabled: boolean;
  renewalMode: 'MANUAL_REVIEW' | 'PAY_AND_ACTIVATE';
  renewalCoverageStartMonth: number;
  renewalCoverageStartDay: number;
  renewalCoverageEndMonth: number;
  renewalCoverageEndDay: number;
  renewalGraceDays: number;
  renewalReminderLeadDays: number;
  renewalReminderFrequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  annualRenewalFee: number;
  includeRenewalFeeInApplication: boolean;
  showCertificateToActiveMembers: boolean;
  showCertificateWhenRenewalDue: boolean;
  showMembershipCardToActiveMembers: boolean;
  showMembershipCardWhenRenewalDue: boolean;
  applicantMessage: string | null;
  paymentCollectionMode: 'MANUAL_PROOF' | 'MPESA_DARAJA';
  applicationFee: number;
  isTaxEnabled: boolean;
  taxPercentage: number | null;
  currency: string;
  manualPaymentInstructions: string | null;
  mpesaBusinessName: string | null;
  mpesaPaybillNumber: string | null;
  mpesaShortCode: string | null;
  darajaTransactionType: string | null;
  isC2BEnabled: boolean;
  c2bShortCode: string | null;
  c2bValidationUrl: string | null;
  c2bConfirmationUrl: string | null;
  c2bResponseType: string | null;
  c2bRegisteredAt: string | null;
  c2bLastRegistrationNote: string | null;
} | null;

type C2BStatus = {
  environment: 'sandbox' | 'production';
  baseUrl: string;
  shortCode: string | null;
  validationUrl: string;
  confirmationUrl: string;
  responseType: 'Completed' | 'Cancelled';
  isConfigured: boolean;
  missing: string[];
};

type ApplicationSettingsPanelProps = {
  portalSetting: PortalSettingItem;
  c2bStatus: C2BStatus;
  startInWizard?: boolean;
  standaloneAssistant?: boolean;
  readiness: {
    isReady: boolean;
    issues: PortalReadinessIssue[];
    activeCategoryCount: number;
    paymentConfiguration: PaymentConfiguration;
  };
  categories: MembershipCategoryItem[];
};

const initialState: SettingsActionState = {};
const wizardStepOrder = ['intake', 'payments', 'paybill', 'renewals', 'documents', 'review'] as const;
type WizardStep = (typeof wizardStepOrder)[number];
type SubmitIntent = 'SAVE' | 'OPEN';

function toWholeNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

const coverageMonths = [
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
] as const;

function getMonthLabel(value: string) {
  return coverageMonths.find((month) => month.value === value)?.label ?? 'January';
}

const stepMeta: Record<WizardStep, { label: string; title: string; description: string; icon: typeof Settings2 }> = {
  intake: {
    label: 'Intake',
    title: 'Intake access',
    description: 'Set the organisation name and decide whether people can open and submit the application form.',
    icon: Settings2,
  },
  payments: {
    label: 'Payments',
    title: 'Payment mode and fees',
    description: 'Choose how people will pay and set the charges for applications and renewals.',
    icon: CreditCard,
  },
  paybill: {
    label: 'Paybill',
    title: 'Paybill details',
    description: 'Add the paybill details needed for direct payment prompts and automatic payment updates.',
    icon: CreditCard,
  },
  renewals: {
    label: 'Renewals',
    title: 'Renewals',
    description: 'Choose whether active members renew yearly and how renewal payments should be handled.',
    icon: ShieldCheck,
  },
  documents: {
    label: 'Documents',
    title: 'Member documents',
    description: 'Choose what approved members can still see after approval and when renewal is due.',
    icon: ShieldCheck,
  },
  review: {
    label: 'Review',
    title: 'Review and finish',
    description: 'Review the full setup, fix any blockers, then save or open the portal.',
    icon: CheckCircle2,
  },
};

export function ApplicationSettingsPanel({
  portalSetting,
  c2bStatus,
  startInWizard = false,
  standaloneAssistant = false,
  readiness,
  categories,
}: ApplicationSettingsPanelProps) {
  const router = useRouter();
  const [portalState, portalAction] = useActionState(saveApplicationPortalSetting, initialState);
  const [categoryState, categoryAction] = useActionState(saveMembershipCategory, initialState);

  const [currentStep, setCurrentStep] = useState<WizardStep>('intake');
  const [submitIntent, setSubmitIntent] = useState<SubmitIntent>('SAVE');
  const [pendingNextStep, setPendingNextStep] = useState<WizardStep | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [setupName, setSetupName] = useState(portalSetting?.setupName ?? '');
  const [shortName, setShortName] = useState(portalSetting?.shortName ?? '');
  const [portalFormOpen, setPortalFormOpen] = useState<boolean>(portalSetting?.isFormOpen ?? false);
  const [isAcceptingApplications, setIsAcceptingApplications] = useState<boolean>(portalSetting?.isAcceptingApplications ?? false);
  const [paymentCollectionMode, setPaymentCollectionMode] = useState<'MANUAL_PROOF' | 'MPESA_DARAJA'>(portalSetting?.paymentCollectionMode ?? 'MANUAL_PROOF');
  const [showApplicationFormAfterApproval, setShowApplicationFormAfterApproval] = useState<boolean>(portalSetting?.showApplicationFormAfterApproval ?? false);
  const [applicationReviewMode, setApplicationReviewMode] = useState<'MANUAL_REVIEW' | 'AUTO_APPROVE_VERIFIED_PAYMENTS'>(
    portalSetting?.applicationReviewMode === 'AUTO_APPROVE_VERIFIED_PAYMENTS' ? 'AUTO_APPROVE_VERIFIED_PAYMENTS' : 'MANUAL_REVIEW',
  );
  const [renewalsEnabled, setRenewalsEnabled] = useState<boolean>(portalSetting?.renewalsEnabled ?? false);
  const [renewalMode, setRenewalMode] = useState<'MANUAL_REVIEW' | 'PAY_AND_ACTIVATE'>(
    portalSetting?.renewalMode === 'PAY_AND_ACTIVATE' ? 'PAY_AND_ACTIVATE' : 'MANUAL_REVIEW',
  );
  const [renewalCoverageStartMonth, setRenewalCoverageStartMonth] = useState(String(portalSetting?.renewalCoverageStartMonth ?? 1));
  const [renewalCoverageStartDay, setRenewalCoverageStartDay] = useState(String(portalSetting?.renewalCoverageStartDay ?? 1));
  const [renewalCoverageEndMonth, setRenewalCoverageEndMonth] = useState(String(portalSetting?.renewalCoverageEndMonth ?? 12));
  const [renewalCoverageEndDay, setRenewalCoverageEndDay] = useState(String(portalSetting?.renewalCoverageEndDay ?? 31));
  const [renewalGraceDays, setRenewalGraceDays] = useState(String(portalSetting?.renewalGraceDays ?? 0));
  const [renewalReminderLeadDays, setRenewalReminderLeadDays] = useState(String(portalSetting?.renewalReminderLeadDays ?? 30));
  const [renewalReminderFrequency, setRenewalReminderFrequency] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY'>(
    portalSetting?.renewalReminderFrequency === 'DAILY'
      ? 'DAILY'
      : portalSetting?.renewalReminderFrequency === 'MONTHLY'
        ? 'MONTHLY'
        : 'WEEKLY',
  );
  const [includeRenewalFeeInApplication, setIncludeRenewalFeeInApplication] = useState<boolean>(portalSetting?.includeRenewalFeeInApplication ?? false);
  const [showCertificateToActiveMembers, setShowCertificateToActiveMembers] = useState<boolean>(portalSetting?.showCertificateToActiveMembers ?? true);
  const [showCertificateWhenRenewalDue, setShowCertificateWhenRenewalDue] = useState<boolean>(portalSetting?.showCertificateWhenRenewalDue ?? false);
  const [showMembershipCardToActiveMembers, setShowMembershipCardToActiveMembers] = useState<boolean>(portalSetting?.showMembershipCardToActiveMembers ?? true);
  const [showMembershipCardWhenRenewalDue, setShowMembershipCardWhenRenewalDue] = useState<boolean>(portalSetting?.showMembershipCardWhenRenewalDue ?? false);
  const [isTaxEnabled, setIsTaxEnabled] = useState<boolean>(portalSetting?.isTaxEnabled ?? false);
  const [c2bResponseType, setC2bResponseType] = useState<'Completed' | 'Cancelled'>(
    portalSetting?.c2bResponseType === 'Cancelled' ? 'Cancelled' : 'Completed',
  );
  const [newCategoryIsActive, setNewCategoryIsActive] = useState(true);
  const [applicationFee, setApplicationFee] = useState(String(portalSetting?.applicationFee ?? 0));
  const [annualRenewalFee, setAnnualRenewalFee] = useState(String(portalSetting?.annualRenewalFee ?? 0));
  const [taxPercentage, setTaxPercentage] = useState(
    portalSetting?.taxPercentage !== null && portalSetting?.taxPercentage !== undefined ? String(portalSetting.taxPercentage) : '',
  );
  const [applicantMessage, setApplicantMessage] = useState(portalSetting?.applicantMessage ?? '');
  const [manualPaymentInstructions, setManualPaymentInstructions] = useState(portalSetting?.manualPaymentInstructions ?? '');
  const [mpesaBusinessName, setMpesaBusinessName] = useState(portalSetting?.mpesaBusinessName ?? '');
  const [mpesaPaybillNumber, setMpesaPaybillNumber] = useState(portalSetting?.mpesaPaybillNumber ?? '');
  const [mpesaShortCode, setMpesaShortCode] = useState(portalSetting?.mpesaShortCode ?? '');
  const [c2bShortCode, setC2bShortCode] = useState(portalSetting?.c2bShortCode ?? portalSetting?.mpesaShortCode ?? portalSetting?.mpesaPaybillNumber ?? '');

  useEffect(() => {
    setSetupName(portalSetting?.setupName ?? '');
    setShortName(portalSetting?.shortName ?? '');
    setPortalFormOpen(portalSetting?.isFormOpen ?? false);
    setIsAcceptingApplications(portalSetting?.isAcceptingApplications ?? false);
    setPaymentCollectionMode(portalSetting?.paymentCollectionMode ?? 'MANUAL_PROOF');
    setShowApplicationFormAfterApproval(portalSetting?.showApplicationFormAfterApproval ?? false);
    setApplicationReviewMode(portalSetting?.applicationReviewMode === 'AUTO_APPROVE_VERIFIED_PAYMENTS' ? 'AUTO_APPROVE_VERIFIED_PAYMENTS' : 'MANUAL_REVIEW');
    setRenewalsEnabled(portalSetting?.renewalsEnabled ?? false);
    setRenewalMode(portalSetting?.renewalMode === 'PAY_AND_ACTIVATE' ? 'PAY_AND_ACTIVATE' : 'MANUAL_REVIEW');
    setRenewalCoverageStartMonth(String(portalSetting?.renewalCoverageStartMonth ?? 1));
    setRenewalCoverageStartDay(String(portalSetting?.renewalCoverageStartDay ?? 1));
    setRenewalCoverageEndMonth(String(portalSetting?.renewalCoverageEndMonth ?? 12));
    setRenewalCoverageEndDay(String(portalSetting?.renewalCoverageEndDay ?? 31));
    setRenewalGraceDays(String(portalSetting?.renewalGraceDays ?? 0));
    setRenewalReminderLeadDays(String(portalSetting?.renewalReminderLeadDays ?? 30));
    setRenewalReminderFrequency(
      portalSetting?.renewalReminderFrequency === 'DAILY'
        ? 'DAILY'
        : portalSetting?.renewalReminderFrequency === 'MONTHLY'
          ? 'MONTHLY'
          : 'WEEKLY',
    );
    setIncludeRenewalFeeInApplication(portalSetting?.includeRenewalFeeInApplication ?? false);
    setShowCertificateToActiveMembers(portalSetting?.showCertificateToActiveMembers ?? true);
    setShowCertificateWhenRenewalDue(portalSetting?.showCertificateWhenRenewalDue ?? false);
    setShowMembershipCardToActiveMembers(portalSetting?.showMembershipCardToActiveMembers ?? true);
    setShowMembershipCardWhenRenewalDue(portalSetting?.showMembershipCardWhenRenewalDue ?? false);
    setIsTaxEnabled(portalSetting?.isTaxEnabled ?? false);
    setC2bResponseType(portalSetting?.c2bResponseType === 'Cancelled' ? 'Cancelled' : 'Completed');
    setApplicationFee(String(portalSetting?.applicationFee ?? 0));
    setAnnualRenewalFee(String(portalSetting?.annualRenewalFee ?? 0));
    setTaxPercentage(
      portalSetting?.taxPercentage !== null && portalSetting?.taxPercentage !== undefined ? String(portalSetting.taxPercentage) : '',
    );
    setApplicantMessage(portalSetting?.applicantMessage ?? '');
    setManualPaymentInstructions(portalSetting?.manualPaymentInstructions ?? '');
    setMpesaBusinessName(portalSetting?.mpesaBusinessName ?? '');
    setMpesaPaybillNumber(portalSetting?.mpesaPaybillNumber ?? '');
    setMpesaShortCode(portalSetting?.mpesaShortCode ?? '');
    setC2bShortCode(portalSetting?.c2bShortCode ?? portalSetting?.mpesaShortCode ?? portalSetting?.mpesaPaybillNumber ?? '');
  }, [portalSetting]);

  useEffect(() => {
    if (portalState.success) {
      toast.success(portalState.success);
      if (pendingNextStep) {
        setCurrentStep(pendingNextStep);
        setPendingNextStep(null);
      }
      if (submitIntent === 'OPEN') {
        router.push('/dashboard');
      }
    }
    if (portalState.error) {
      toast.error(portalState.error);
      setPendingNextStep(null);
    }
  }, [pendingNextStep, portalState, router, submitIntent]);

  useEffect(() => {
    if (categoryState.success) toast.success(categoryState.success);
    if (categoryState.error) toast.error(categoryState.error);
  }, [categoryState]);

  const isMobilePayments = paymentCollectionMode === 'MPESA_DARAJA';
  const baseApplicationFee = toWholeNumber(applicationFee);
  const baseRenewalFee = toWholeNumber(annualRenewalFee);
  const activeTaxPercentage = isTaxEnabled ? toWholeNumber(taxPercentage) : 0;
  const applicationTaxAmount = Math.round((baseApplicationFee * activeTaxPercentage) / 100);
  const renewalTaxAmount = Math.round((baseRenewalFee * activeTaxPercentage) / 100);
  const applicationTotal = baseApplicationFee + applicationTaxAmount;
  const renewalTotal = baseRenewalFee + renewalTaxAmount;
  const hasActiveCategories = readiness.activeCategoryCount > 0;
  const intakeIsClosedOrPaused = !portalFormOpen || !isAcceptingApplications;

  const steps = useMemo(() => {
    return [
      { id: 'intake', ...stepMeta.intake },
      { id: 'payments', ...stepMeta.payments },
      ...(isMobilePayments ? [{ id: 'paybill', ...stepMeta.paybill }] : []),
      { id: 'renewals', ...stepMeta.renewals },
      { id: 'documents', ...stepMeta.documents },
      { id: 'review', ...stepMeta.review },
    ] as Array<{ id: WizardStep; label: string; title: string; description: string; icon: typeof Settings2 }>;
  }, [isMobilePayments]);

  useEffect(() => {
    if (!isMobilePayments && currentStep === 'paybill') {
      setCurrentStep('renewals');
    }
  }, [currentStep, isMobilePayments]);

  useEffect(() => {
    if (startInWizard) {
      setCurrentStep('intake');
    }
  }, [startInWizard]);

  const stepBlockers = useMemo<Record<WizardStep, string[]>>(() => {
    const blockers: Record<WizardStep, string[]> = {
      intake: [],
      payments: [],
      paybill: [],
      renewals: [],
      documents: [],
      review: [],
    };

    if (!setupName.trim()) blockers.intake.push('Enter the organisation name.');
    if (!shortName.trim()) blockers.intake.push('Enter the organisation short name.');
    if (!portalFormOpen) blockers.intake.push('Turn on form access before opening the portal.');
    if (!isAcceptingApplications) blockers.intake.push('Allow new applications before opening the portal.');
    if ((!portalFormOpen || !isAcceptingApplications) && !applicantMessage.trim()) {
      blockers.intake.push('Add an applicant message so people know why applications are not available.');
    }

    if (baseApplicationFee <= 0) blockers.payments.push('Set an application fee greater than zero.');
    if (isTaxEnabled && activeTaxPercentage <= 0) blockers.payments.push('Enter a tax percentage or switch tax off.');
    if (paymentCollectionMode === 'MANUAL_PROOF' && !manualPaymentInstructions.trim()) {
      blockers.payments.push('Add receipt-upload instructions for applicants.');
    }

    if (isMobilePayments) {
      if (!mpesaBusinessName.trim()) blockers.paybill.push('Enter the paybill business name.');
      if (!mpesaPaybillNumber.trim()) blockers.paybill.push('Enter the paybill number.');
      if (!mpesaShortCode.trim()) blockers.paybill.push('Enter the paybill short code.');
      if (!c2bShortCode.trim()) blockers.paybill.push('Enter the callback short code.');
      if (!c2bStatus.isConfigured) blockers.paybill.push('Developer callback links are not fully configured yet.');
    }

    if (renewalsEnabled && baseRenewalFee <= 0) {
      blockers.renewals.push('Set a renewal fee before turning renewals on.');
    }
    if (renewalsEnabled && toWholeNumber(renewalGraceDays) < 0) {
      blockers.renewals.push('Enter valid grace days.');
    }
    if (renewalsEnabled && toWholeNumber(renewalReminderLeadDays) < 0) {
      blockers.renewals.push('Enter valid reminder lead days.');
    }
    if (includeRenewalFeeInApplication && !renewalsEnabled) {
      blockers.renewals.push('Turn on annual renewals before bundling the first renewal with registration.');
    }

    if (!showCertificateToActiveMembers && !showMembershipCardToActiveMembers) {
      blockers.documents.push('Choose at least one member document to keep visible after approval.');
    }

    blockers.review = [
      ...blockers.intake,
      ...blockers.payments,
      ...(isMobilePayments ? blockers.paybill : []),
      ...blockers.renewals,
      ...blockers.documents,
    ];

    if (!hasActiveCategories) {
      blockers.review.push('Add at least one active membership category before opening the portal.');
    }

    return blockers;
  }, [
    activeTaxPercentage,
    applicantMessage,
    baseApplicationFee,
    baseRenewalFee,
    c2bShortCode,
    c2bStatus.isConfigured,
    hasActiveCategories,
    isAcceptingApplications,
    isMobilePayments,
    isTaxEnabled,
    manualPaymentInstructions,
    mpesaBusinessName,
    mpesaPaybillNumber,
    mpesaShortCode,
    portalFormOpen,
    renewalsEnabled,
    renewalCoverageStartMonth,
    renewalCoverageStartDay,
    renewalCoverageEndMonth,
    renewalCoverageEndDay,
    renewalGraceDays,
    renewalReminderLeadDays,
    includeRenewalFeeInApplication,
    setupName,
    shortName,
    showCertificateToActiveMembers,
    showMembershipCardToActiveMembers,
  ]);

  const currentStepIndex = steps.findIndex((step) => step.id === currentStep);
  const previousStep = currentStepIndex > 0 ? steps[currentStepIndex - 1]?.id : null;
  const nextStep = currentStepIndex >= 0 && currentStepIndex < steps.length - 1 ? steps[currentStepIndex + 1]?.id : null;
  const currentStepInfo = steps[currentStepIndex] ?? steps[0];
  const currentBlockers = stepBlockers[currentStep];
  const reviewBlockers = stepBlockers.review;
  const completedSteps = steps.filter((step) => stepBlockers[step.id].length === 0).length;
  const completionPercentage = Math.max(12, Math.round(((currentStepIndex + 1) / steps.length) * 100));

  function renderStepHeader(stepId: WizardStep) {
    const stepNumber = steps.findIndex((step) => step.id === stepId) + 1;
    const Icon = stepMeta[stepId].icon;

    return (
      <div className="rounded-[28px] border border-[color:var(--border-soft)] bg-white px-6 py-5 sm:px-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-[var(--brand-soft)] p-3 text-[var(--brand)] ring-1 ring-[var(--brand-border)]/60">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="portal-kicker text-[var(--brand)]">Step {stepNumber}</p>
              <h3 className="mt-2 text-[22px] font-medium tracking-[-0.02em] text-slate-950">{stepMeta[stepId].title}</h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{stepMeta[stepId].description}</p>
            </div>
          </div>
          <Badge variant="outline" className="w-fit rounded-full border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-600">
            {stepNumber} of {steps.length}
          </Badge>
        </div>
      </div>
    );
  }

    function renderStepAlerts(stepId: WizardStep) {
    const blockers = stepBlockers[stepId];
    if (blockers.length === 0) {
      return (
        <Alert className="rounded-2xl border-emerald-200 bg-emerald-50/70 text-emerald-700">
          <CheckCircle2 className="text-emerald-700" />
          <AlertTitle className="text-emerald-700">Ready</AlertTitle>
          <AlertDescription className="text-emerald-700">No blockers in this step.</AlertDescription>
        </Alert>
      );
    }

    return (
      <Alert className="rounded-2xl border-amber-200 bg-amber-50/70 text-slate-700">
        <AlertCircle className="text-amber-600" />
        <AlertTitle className="text-slate-900">Needs attention</AlertTitle>
        <AlertDescription className="space-y-1 text-slate-700">
          {blockers.map((blocker) => (
            <p key={blocker}>{blocker}</p>
          ))}
        </AlertDescription>
      </Alert>
    );
  }

  function renderStepContent() {
    switch (currentStep) {
      case 'intake':
        return (
          <Card className="rounded-3xl border-[color:var(--border-soft)] bg-[var(--surface-elevated)] shadow-none">
            {renderStepHeader('intake')}
            <CardContent className="space-y-5 p-5 pt-0">
              {renderStepAlerts('intake')}
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(220px,0.6fr)]">
                <Field>
                  <FieldLabel htmlFor="setupName" required>Organisation name</FieldLabel>
                  <Input
                    id="setupName"
                    value={setupName}
                    onChange={(event) => setSetupName(event.target.value)}
                    placeholder="IGANO Professional Development Association"
                    maxLength={120}
                  />
                  <FieldDescription>Shown on certificates, cards, and the application form.</FieldDescription>
                  <FieldError>{portalState.fieldErrors?.setupName?.[0]}</FieldError>
                </Field>
                <Field>
                  <FieldLabel htmlFor="shortName" required>Short name</FieldLabel>
                  <Input
                    id="shortName"
                    value={shortName}
                    onChange={(event) => setShortName(event.target.value.toUpperCase())}
                    placeholder="IGPDA"
                    maxLength={20}
                  />
                  <FieldDescription>Used where space is tight, like the portal sidebar and quick branding.</FieldDescription>
                  <FieldError>{portalState.fieldErrors?.shortName?.[0]}</FieldError>
                </Field>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <Card className="rounded-2xl border-[color:var(--border-soft)] bg-white shadow-none">
                  <CardContent className="flex items-start justify-between gap-4 p-5">
                    <div>
                      <p className="font-medium text-slate-900">Form access</p>
                      <p className="mt-1 text-sm text-slate-600">If this is off, applicants cannot open the application form.</p>
                    </div>
                    <Switch checked={portalFormOpen} onCheckedChange={setPortalFormOpen} aria-label="Toggle form open" />
                  </CardContent>
                </Card>
                <Card className="rounded-2xl border-[color:var(--border-soft)] bg-white shadow-none">
                  <CardContent className="flex items-start justify-between gap-4 p-5">
                    <div>
                      <p className="font-medium text-slate-900">Accept new applications</p>
                      <p className="mt-1 text-sm text-slate-600">If this is off, applicants can view the form but cannot submit it.</p>
                    </div>
                    <Switch checked={isAcceptingApplications} onCheckedChange={setIsAcceptingApplications} aria-label="Toggle application intake" />
                  </CardContent>
                </Card>
              </div>

              {intakeIsClosedOrPaused ? (
                <Field>
                  <FieldLabel htmlFor="applicantMessage" required>Applicant message</FieldLabel>
                  <Textarea
                    id="applicantMessage"
                    value={applicantMessage}
                    onChange={(event) => setApplicantMessage(event.target.value)}
                    placeholder={portalFormOpen ? 'Applications are temporarily paused. Please check back later.' : 'Applications are currently closed. Please check back later.'}
                    className="min-h-24"
                  />
                  <FieldDescription>
                    {portalFormOpen
                      ? 'Shown on the application page while new applications are paused.'
                      : 'Shown on the application page while the form is closed.'}
                  </FieldDescription>
                  <FieldError>{portalState.fieldErrors?.applicantMessage?.[0]}</FieldError>
                </Field>
              ) : null}
            </CardContent>
          </Card>
        );

      case 'payments':
        return (
          <Card id="payment-settings" className="rounded-3xl border-[color:var(--border-soft)] bg-[var(--surface-elevated)] shadow-none">
            {renderStepHeader('payments')}
            <CardContent className="space-y-5 p-5 pt-0">
              {renderStepAlerts('payments')}

              <Card className="rounded-2xl border-[color:var(--border-soft)] bg-white shadow-none">
                <CardHeader className="p-5 pb-3">
                  <CardTitle className="text-sm font-medium text-slate-950">How will people pay?</CardTitle>
                  <CardDescription>Choose one collection method for the application journey.</CardDescription>
                </CardHeader>
                <CardContent className="p-5 pt-0">
                  <RadioGroup
                    value={paymentCollectionMode}
                    onValueChange={(value: 'MANUAL_PROOF' | 'MPESA_DARAJA') => setPaymentCollectionMode(value)}
                    className="grid gap-3 lg:grid-cols-2"
                  >
                    <label className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition',
                      paymentCollectionMode === 'MANUAL_PROOF'
                        ? 'border-[var(--brand-border)] bg-[var(--brand-soft)] shadow-sm'
                        : 'border-[color:var(--border-soft)] bg-white hover:border-slate-300',
                    )}>
                      <RadioGroupItem value="MANUAL_PROOF" className="mt-1" />
                      <div className="min-w-0">
                        <p className="font-medium text-slate-950">Receipt upload</p>
                        <p className="mt-1 text-sm text-slate-600">Applicants pay first, then upload the receipt number and proof.</p>
                      </div>
                    </label>

                    <label className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition',
                      paymentCollectionMode === 'MPESA_DARAJA'
                        ? 'border-[var(--brand-border)] bg-[var(--brand-soft)] shadow-sm'
                        : 'border-[color:var(--border-soft)] bg-white hover:border-slate-300',
                    )}>
                      <RadioGroupItem value="MPESA_DARAJA" className="mt-1" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-slate-950">Paybill payment</p>
                          <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]">Automatic</Badge>
                        </div>
                        <p className="mt-1 text-sm text-slate-600">Prompt applicants directly and receive payment updates in the portal.</p>
                      </div>
                    </label>
                  </RadioGroup>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-[color:var(--border-soft)] bg-white shadow-none">
                <CardHeader className="p-5 pb-3">
                  <CardTitle className="text-sm font-medium text-slate-950">Tax on portal fees</CardTitle>
                  <CardDescription>One tax setting applies to both the application fee and the yearly renewal fee.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 p-5 pt-0">
                  <div className="flex items-start justify-between gap-4 rounded-2xl border border-[color:var(--border-soft)] bg-slate-50/70 p-4">
                    <div>
                      <p className="font-medium text-slate-900">Add tax</p>
                      <p className="mt-1 text-sm text-slate-600">Turn this on only if you need tax added to portal charges.</p>
                    </div>
                    <Switch checked={isTaxEnabled} onCheckedChange={setIsTaxEnabled} aria-label="Toggle tax" />
                  </div>

                  {isTaxEnabled ? (
                    <Field>
                      <FieldLabel htmlFor="taxPercentage" required>Tax percentage</FieldLabel>
                      <Input
                        id="taxPercentage"
                        type="number"
                        min="0"
                        max="100"
                        value={taxPercentage}
                        onChange={(event) => setTaxPercentage(event.target.value)}
                        placeholder="16"
                      />
                      <FieldDescription>Example: enter 16 for 16% VAT.</FieldDescription>
                      <FieldError>{portalState.fieldErrors?.taxPercentage?.[0]}</FieldError>
                    </Field>
                  ) : <input type="hidden" name="taxPercentage" value="" />}
                </CardContent>
              </Card>

              <div className={cn('grid gap-5', paymentCollectionMode === 'MANUAL_PROOF' && 'xl:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]')}>
                <Card className="rounded-2xl border-[color:var(--border-soft)] bg-white shadow-none">
                  <CardHeader className="p-5 pb-3">
                    <CardTitle className="text-sm font-medium text-slate-950">Application fee</CardTitle>
                    <CardDescription>Set what each new applicant should pay to complete submission.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 p-5 pt-0">
                    <Field>
                      <FieldLabel htmlFor="applicationFee" required>Base fee</FieldLabel>
                      <Input
                        id="applicationFee"
                        type="number"
                        min="1"
                        value={applicationFee}
                        onChange={(event) => setApplicationFee(event.target.value)}
                        placeholder="1500"
                      />
                      <FieldDescription>Enter the amount before tax.</FieldDescription>
                      <FieldError>{portalState.fieldErrors?.applicationFee?.[0]}</FieldError>
                    </Field>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-[color:var(--border-soft)] bg-slate-50/70 p-4">
                        <p className="portal-kicker text-slate-500">Base fee</p>
                        <p className="mt-2 text-lg font-medium text-slate-950">{portalSetting?.currency ?? 'KES'} {baseApplicationFee.toLocaleString()}</p>
                      </div>
                      <div className="rounded-2xl border border-[color:var(--border-soft)] bg-slate-50/70 p-4">
                        <p className="portal-kicker text-slate-500">Tax</p>
                        <p className="mt-2 text-lg font-medium text-slate-950">{portalSetting?.currency ?? 'KES'} {applicationTaxAmount.toLocaleString()}</p>
                      </div>
                      <div className="rounded-2xl border border-[color:var(--border-soft)] bg-slate-50/70 p-4">
                        <p className="portal-kicker text-slate-500">Applicant total</p>
                        <p className="mt-2 text-lg font-medium text-slate-950">{portalSetting?.currency ?? 'KES'} {applicationTotal.toLocaleString()}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {paymentCollectionMode === 'MANUAL_PROOF' ? (
                  <div className="space-y-5">
                    <Card className="rounded-2xl border-[color:var(--border-soft)] bg-white shadow-none">
                      <CardHeader className="p-5 pb-3">
                        <CardTitle className="text-sm font-medium text-slate-950">Receipt instructions</CardTitle>
                        <CardDescription>Tell applicants exactly what to do after they pay outside the portal.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4 p-5 pt-0">
                        <Field>
                          <FieldLabel htmlFor="manualPaymentInstructions" required>Instructions shown to applicants</FieldLabel>
                          <Textarea
                            id="manualPaymentInstructions"
                            value={manualPaymentInstructions}
                            onChange={(event) => setManualPaymentInstructions(event.target.value)}
                            placeholder="Applicants should pay first, then upload the receipt number and proof."
                            className="min-h-28"
                          />
                          <FieldDescription>This message appears on the application payment step.</FieldDescription>
                          <FieldError>{portalState.fieldErrors?.manualPaymentInstructions?.[0]}</FieldError>
                        </Field>
                      </CardContent>
                    </Card>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        );

      case 'paybill':
        return (
          <Card className="rounded-3xl border-[color:var(--border-soft)] bg-[var(--surface-elevated)] shadow-none">
            {renderStepHeader('paybill')}
            <CardContent className="space-y-5 p-5 pt-0">
              {renderStepAlerts('paybill')}

              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
                <Card className="rounded-2xl border-[color:var(--border-soft)] bg-white shadow-none">
                  <CardHeader className="p-5 pb-3">
                    <CardTitle className="text-sm font-medium text-slate-950">Paybill details</CardTitle>
                    <CardDescription>The main paybill information used by the portal.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 p-5 pt-0">
                    <Field>
                      <FieldLabel htmlFor="mpesaBusinessName" required>Paybill business name</FieldLabel>
                      <Input id="mpesaBusinessName" value={mpesaBusinessName} onChange={(event) => setMpesaBusinessName(event.target.value)} placeholder="IGANO Portal" />
                      <FieldDescription>Shown to applicants when a paybill prompt is sent.</FieldDescription>
                      <FieldError>{portalState.fieldErrors?.mpesaBusinessName?.[0]}</FieldError>
                    </Field>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-[color:var(--border-soft)] bg-slate-50/70 p-4">
                        <p className="portal-kicker text-slate-500">Paybill short code</p>
                        <p className="mt-2 text-lg font-medium text-slate-950">{mpesaShortCode || 'Not set'}</p>
                        <p className="mt-1 text-sm text-slate-600">Read-only from developer payment setup.</p>
                      </div>
                      <div className="rounded-2xl border border-[color:var(--border-soft)] bg-slate-50/70 p-4">
                        <p className="portal-kicker text-slate-500">Response when received</p>
                        <p className="mt-2 text-lg font-medium text-slate-950">{c2bResponseType}</p>
                        <p className="mt-1 text-sm text-slate-600">Read-only from callback configuration.</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border-[color:var(--border-soft)] bg-white shadow-none">
                  <CardHeader className="p-5 pb-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-sm font-medium text-slate-950">
                          {c2bStatus.environment === 'sandbox' ? 'Sandbox paybill setup' : 'Automatic paybill registration'}
                        </CardTitle>
                        <CardDescription>
                          {c2bStatus.environment === 'sandbox'
                            ? 'Sandbox mode skips direct paybill URL registration so you can continue with paybill prompt testing.'
                            : 'The portal registers the public callback links automatically when this step is saved.'}
                        </CardDescription>
                      </div>
                      <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px] font-semibold">
                        {c2bStatus.environment === 'sandbox'
                          ? 'Sandbox'
                          : c2bStatus.isConfigured
                            ? 'Ready'
                            : 'Needs setup'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 p-5 pt-0 text-sm text-slate-700">
                    <div className="rounded-2xl border border-[color:var(--border-soft)] bg-slate-50/70 p-4">
                      <p className="font-medium text-slate-950">
                        {c2bStatus.environment === 'sandbox' ? 'Sandbox status' : 'Registration status'}
                      </p>
                      <p className="mt-2">
                        {c2bStatus.environment === 'sandbox'
                          ? 'Direct paybill URL registration is skipped in sandbox.'
                          : `Registered on: ${portalSetting?.c2bRegisteredAt ?? 'Not registered yet'}`}
                      </p>
                      <p className="mt-1">
                        {portalSetting?.c2bLastRegistrationNote
                          ?? (c2bStatus.environment === 'sandbox'
                            ? 'Paybill prompts can still be tested with sandbox credentials.'
                            : 'No registration attempt recorded yet.')}
                      </p>
                    </div>
                    <p className="text-sm text-slate-600">
                      {c2bStatus.environment === 'sandbox'
                        ? 'Review the public links below only if you need to confirm the developer setup.'
                        : 'Review the public links below if you need to confirm the developer setup.'}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Collapsible className="rounded-2xl border border-[color:var(--border-soft)] bg-white">
                <CollapsibleTrigger className="flex w-full items-center justify-between px-5 py-4 text-left">
                  <div>
                    <p className="font-medium text-slate-950">View Safaricom callback links</p>
                    <p className="mt-1 text-sm text-slate-600">These public https links are sent during registration.</p>
                  </div>
                  <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px] font-semibold">
                    {c2bStatus.isConfigured ? 'Public links ready' : 'Check links'}
                  </Badge>
                </CollapsibleTrigger>
                <CollapsibleContent className="border-t border-[color:var(--border-soft)] px-5 py-5">
                  <div className="grid gap-5 lg:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="c2bShortCode" required>Callback short code</FieldLabel>
                      <Input id="c2bShortCode" value={c2bShortCode || mpesaShortCode} readOnly className="bg-slate-50" />
                      <FieldDescription>Read-only. Uses the same configured short code as the paybill setup.</FieldDescription>
                      <FieldError>{portalState.fieldErrors?.c2bShortCode?.[0]}</FieldError>
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="c2bValidationUrl" required>Validation link sent to Safaricom</FieldLabel>
                      <Input id="c2bValidationUrl" value={c2bStatus.validationUrl} readOnly className="bg-slate-50" />
                      <FieldDescription>Read-only. Must be a public https link.</FieldDescription>
                      <FieldError>{portalState.fieldErrors?.c2bValidationUrl?.[0]}</FieldError>
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="c2bConfirmationUrl" required>Confirmation link sent to Safaricom</FieldLabel>
                      <Input id="c2bConfirmationUrl" value={c2bStatus.confirmationUrl} readOnly className="bg-slate-50" />
                      <FieldDescription>Read-only. Must be a public https link.</FieldDescription>
                      <FieldError>{portalState.fieldErrors?.c2bConfirmationUrl?.[0]}</FieldError>
                    </Field>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>
        );

      case 'renewals':
        return (
          <Card className="rounded-3xl border-[color:var(--border-soft)] bg-[var(--surface-elevated)] shadow-none">
            {renderStepHeader('renewals')}
            <CardContent className="space-y-5 p-5 pt-0 sm:p-6 sm:pt-0">
              {renderStepAlerts('renewals')}

              <Card className="rounded-2xl border-[color:var(--border-soft)] bg-white shadow-none">
                <CardHeader className="p-5 pb-3">
                  <CardTitle className="text-sm font-medium text-slate-950">Should members renew yearly?</CardTitle>
                  <CardDescription>Turn this on only if approved members need yearly payment to keep access active.</CardDescription>
                </CardHeader>
                <CardContent className="p-5 pt-0">
                  <div className="flex items-start justify-between gap-4 rounded-2xl border border-[color:var(--border-soft)] bg-slate-50/70 p-4">
                    <div>
                      <p className="font-medium text-slate-900">Annual renewals</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">When this is on, members will see renewal status, reminders, and payment actions in their portal.</p>
                    </div>
                    <Switch checked={renewalsEnabled} onCheckedChange={setRenewalsEnabled} aria-label="Toggle annual renewals" />
                  </div>
                </CardContent>
              </Card>

              {renewalsEnabled ? (
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
                  <div className="space-y-5">
                    <Card className="rounded-2xl border-[color:var(--border-soft)] bg-white shadow-none">
                      <CardHeader className="p-5 pb-3">
                        <CardTitle className="text-sm font-medium text-slate-950">Renewal payment</CardTitle>
                        <CardDescription>Choose how paid renewals are handled and set the yearly renewal fee.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-5 p-5 pt-0">
                        <Field>
                          <FieldLabel>Renewal handling</FieldLabel>
                          <Select value={renewalMode} onValueChange={(value: 'MANUAL_REVIEW' | 'PAY_AND_ACTIVATE') => setRenewalMode(value)}>
                            <SelectTrigger className="h-11 w-full rounded-xl">
                              <SelectValue placeholder="Select renewal mode" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="MANUAL_REVIEW">Pay first, then review</SelectItem>
                              <SelectItem value="PAY_AND_ACTIVATE">Pay and restore access immediately</SelectItem>
                            </SelectContent>
                          </Select>
                          <FieldDescription>Choose whether paid renewals wait for admin review or restore access automatically.</FieldDescription>
                        </Field>

                        <Field>
                          <FieldLabel htmlFor="annualRenewalFee" required>Renewal base fee</FieldLabel>
                          <Input id="annualRenewalFee" type="number" min="0" value={annualRenewalFee} onChange={(event) => setAnnualRenewalFee(event.target.value)} placeholder="1000" />
                          <FieldDescription>Enter the amount before tax.</FieldDescription>
                          <FieldError>{portalState.fieldErrors?.annualRenewalFee?.[0]}</FieldError>
                        </Field>
                      </CardContent>
                    </Card>

                    <Card className="rounded-2xl border-[color:var(--border-soft)] bg-white shadow-none">
                      <CardHeader className="p-5 pb-3">
                        <CardTitle className="text-sm font-medium text-slate-950">Coverage period</CardTitle>
                        <CardDescription>Set the yearly membership window that renewal payments should cover.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-5 p-5 pt-0">
                        <div className="grid gap-4 lg:grid-cols-2">
                          <Card className="rounded-2xl border-[color:var(--border-soft)] bg-slate-50/70 shadow-none">
                            <CardContent className="space-y-4 p-4">
                              <div>
                                <p className="text-sm font-medium text-slate-900">Coverage starts</p>
                                <p className="mt-1 text-xs text-slate-500">Pick the first day included by one renewal payment.</p>
                              </div>
                              <Field>
                                <FieldLabel required>Month</FieldLabel>
                                <Select value={renewalCoverageStartMonth} onValueChange={setRenewalCoverageStartMonth}>
                                  <SelectTrigger className="h-11 w-full rounded-xl">
                                    <SelectValue placeholder="Choose month" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {coverageMonths.map((month) => (
                                      <SelectItem key={month.value} value={month.value}>{month.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </Field>
                              <Field>
                                <FieldLabel htmlFor="renewalCoverageStartDay" required>Day</FieldLabel>
                                <Input id="renewalCoverageStartDay" type="number" min="1" max="31" value={renewalCoverageStartDay} onChange={(event) => setRenewalCoverageStartDay(event.target.value)} />
                                <FieldError>{portalState.fieldErrors?.renewalCoverageStartDay?.[0]}</FieldError>
                              </Field>
                            </CardContent>
                          </Card>

                          <Card className="rounded-2xl border-[color:var(--border-soft)] bg-slate-50/70 shadow-none">
                            <CardContent className="space-y-4 p-4">
                              <div>
                                <p className="text-sm font-medium text-slate-900">Coverage ends</p>
                                <p className="mt-1 text-xs text-slate-500">Pick the last day covered before grace starts.</p>
                              </div>
                              <Field>
                                <FieldLabel required>Month</FieldLabel>
                                <Select value={renewalCoverageEndMonth} onValueChange={setRenewalCoverageEndMonth}>
                                  <SelectTrigger className="h-11 w-full rounded-xl">
                                    <SelectValue placeholder="Choose month" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {coverageMonths.map((month) => (
                                      <SelectItem key={month.value} value={month.value}>{month.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </Field>
                              <Field>
                                <FieldLabel htmlFor="renewalCoverageEndDay" required>Day</FieldLabel>
                                <Input id="renewalCoverageEndDay" type="number" min="1" max="31" value={renewalCoverageEndDay} onChange={(event) => setRenewalCoverageEndDay(event.target.value)} />
                                <FieldError>{portalState.fieldErrors?.renewalCoverageEndDay?.[0]}</FieldError>
                              </Field>
                            </CardContent>
                          </Card>
                        </div>

                        <Field>
                          <FieldLabel htmlFor="renewalGraceDays" required>Grace period after expiry</FieldLabel>
                          <Input id="renewalGraceDays" type="number" min="0" max="365" value={renewalGraceDays} onChange={(event) => setRenewalGraceDays(event.target.value)} placeholder="0" />
                          <FieldDescription>How many extra days members keep grace access after the coverage end date.</FieldDescription>
                          <FieldError>{portalState.fieldErrors?.renewalGraceDays?.[0]}</FieldError>
                        </Field>
                      </CardContent>
                    </Card>

                    <Card className="rounded-2xl border-[color:var(--border-soft)] bg-white shadow-none">
                      <CardHeader className="p-5 pb-3">
                        <CardTitle className="text-sm font-medium text-slate-950">Renewal reminders</CardTitle>
                        <CardDescription>Choose when reminders start and how often members should see them.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-5 p-5 pt-0">
                        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
                          <Field>
                            <FieldLabel htmlFor="renewalReminderLeadDays" required>Start reminders before expiry</FieldLabel>
                            <Input
                              id="renewalReminderLeadDays"
                              type="number"
                              min="0"
                              max="365"
                              value={renewalReminderLeadDays}
                              onChange={(event) => setRenewalReminderLeadDays(event.target.value)}
                              placeholder="30"
                            />
                            <FieldDescription>How many days before the end of coverage members should start seeing renewal reminders.</FieldDescription>
                            <FieldError>{portalState.fieldErrors?.renewalReminderLeadDays?.[0]}</FieldError>
                          </Field>

                          <Field>
                            <FieldLabel>Reminder frequency</FieldLabel>
                            <Select value={renewalReminderFrequency} onValueChange={(value: 'DAILY' | 'WEEKLY' | 'MONTHLY') => setRenewalReminderFrequency(value)}>
                              <SelectTrigger className="h-11 w-full rounded-xl">
                                <SelectValue placeholder="Choose reminder frequency" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="DAILY">Daily</SelectItem>
                                <SelectItem value="WEEKLY">Weekly</SelectItem>
                                <SelectItem value="MONTHLY">Monthly</SelectItem>
                              </SelectContent>
                            </Select>
                            <FieldDescription>Used for member renewal reminders in the portal.</FieldDescription>
                          </Field>
                        </div>

                        <div className="flex items-start justify-between gap-4 rounded-2xl border border-[color:var(--border-soft)] bg-slate-50/70 p-4">
                          <div>
                            <p className="font-medium text-slate-900">Bundle the first renewal on registration</p>
                            <p className="mt-1 text-sm leading-6 text-slate-600">When this is on, new applicants pay the application fee and the first renewal fee in one checkout.</p>
                          </div>
                          <Switch checked={includeRenewalFeeInApplication} onCheckedChange={setIncludeRenewalFeeInApplication} aria-label="Toggle bundled first renewal on registration" />
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="space-y-4 xl:sticky xl:top-24">
                    <Card className="rounded-2xl border-[color:var(--border-soft)] bg-white shadow-none">
                      <CardHeader className="p-5 pb-3">
                        <CardTitle className="text-sm font-medium text-slate-950">Renewal summary</CardTitle>
                        <CardDescription>What one member will pay and how the renewal cycle behaves.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3 p-5 pt-0">
                        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                          <div className="rounded-2xl border border-[color:var(--border-soft)] bg-slate-50/70 p-4">
                            <p className="portal-kicker text-slate-500">Base fee</p>
                            <p className="mt-2 text-lg font-medium text-slate-950">{portalSetting?.currency ?? 'KES'} {baseRenewalFee.toLocaleString()}</p>
                          </div>
                          <div className="rounded-2xl border border-[color:var(--border-soft)] bg-slate-50/70 p-4">
                            <p className="portal-kicker text-slate-500">Tax</p>
                            <p className="mt-2 text-lg font-medium text-slate-950">{portalSetting?.currency ?? 'KES'} {renewalTaxAmount.toLocaleString()}</p>
                          </div>
                          <div className="rounded-2xl border border-[color:var(--border-soft)] bg-slate-50/70 p-4">
                            <p className="portal-kicker text-slate-500">Member total</p>
                            <p className="mt-2 text-lg font-medium text-slate-950">{portalSetting?.currency ?? 'KES'} {renewalTotal.toLocaleString()}</p>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-[color:var(--border-soft)] bg-slate-50/70 p-4">
                          <p className="portal-kicker text-slate-500">Coverage cycle</p>
                          <p className="mt-2 text-sm leading-6 text-slate-950">
                            Coverage runs from {getMonthLabel(renewalCoverageStartMonth)} {toWholeNumber(renewalCoverageStartDay)} to {getMonthLabel(renewalCoverageEndMonth)} {toWholeNumber(renewalCoverageEndDay)}.
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Grace period: {toWholeNumber(renewalGraceDays)} day{toWholeNumber(renewalGraceDays) === 1 ? '' : 's'}.
                          </p>
                        </div>

                        <div className="rounded-2xl border border-[color:var(--border-soft)] bg-slate-50/70 p-4">
                          <p className="portal-kicker text-slate-500">Reminder window</p>
                          <p className="mt-2 text-sm leading-6 text-slate-950">
                            Members will start seeing reminders {toWholeNumber(renewalReminderLeadDays)} day{toWholeNumber(renewalReminderLeadDays) === 1 ? '' : 's'} before expiry.
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Frequency: {renewalReminderFrequency === 'DAILY' ? 'Daily' : renewalReminderFrequency === 'MONTHLY' ? 'Monthly' : 'Weekly'}.
                          </p>
                        </div>

                        {includeRenewalFeeInApplication ? (
                          <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-soft)] p-4">
                            <p className="portal-kicker text-[var(--brand)]">Registration bundle</p>
                            <p className="mt-2 text-sm leading-6 text-slate-950">
                              New applicants will pay {(portalSetting?.currency ?? 'KES')} {(applicationTotal + renewalTotal).toLocaleString()} total when registration starts.
                            </p>
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        );

      case 'documents':
        return (
          <Card className="rounded-3xl border-[color:var(--border-soft)] bg-[var(--surface-elevated)] shadow-none">
            {renderStepHeader('documents')}
            <CardContent className="space-y-5 p-5 pt-0">
              {renderStepAlerts('documents')}
              <div className="grid gap-3 lg:grid-cols-2">
                <Card className="rounded-2xl border-[color:var(--border-soft)] bg-white shadow-none">
                  <CardContent className="flex items-start justify-between gap-4 p-5">
                    <div>
                      <p className="font-medium text-slate-900">Application form after approval</p>
                      <p className="mt-1 text-sm text-slate-600">Keep the form visible for approved members.</p>
                    </div>
                    <Switch checked={showApplicationFormAfterApproval} onCheckedChange={setShowApplicationFormAfterApproval} aria-label="Toggle application form after approval" />
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border-[color:var(--border-soft)] bg-white shadow-none">
                  <CardContent className="space-y-3 p-5">
                    <div>
                      <p className="font-medium text-slate-900">Application review mode</p>
                      <p className="mt-1 text-sm text-slate-600">Choose whether new applications wait for admin review or can be approved automatically after verified payment.</p>
                    </div>
                    <Select value={applicationReviewMode} onValueChange={(value: 'MANUAL_REVIEW' | 'AUTO_APPROVE_VERIFIED_PAYMENTS') => setApplicationReviewMode(value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select review mode" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MANUAL_REVIEW">Manual review after submission</SelectItem>
                        <SelectItem value="AUTO_APPROVE_VERIFIED_PAYMENTS">Auto-approve verified M-Pesa submissions</SelectItem>
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      Manual proof uploads stay pending. Automatic approval only applies when M-Pesa payment is already verified before submission.
                    </FieldDescription>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border-[color:var(--border-soft)] bg-white shadow-none">
                  <CardContent className="flex items-start justify-between gap-4 p-5">
                    <div>
                      <p className="font-medium text-slate-900">Certificate for active members</p>
                      <p className="mt-1 text-sm text-slate-600">Show certificates while membership is current.</p>
                    </div>
                    <Switch checked={showCertificateToActiveMembers} onCheckedChange={setShowCertificateToActiveMembers} aria-label="Toggle certificate for active members" />
                  </CardContent>
                </Card>

                {renewalsEnabled && showCertificateToActiveMembers ? (
                  <Card className="rounded-2xl border-[color:var(--border-soft)] bg-white shadow-none">
                    <CardContent className="flex items-start justify-between gap-4 p-5">
                      <div>
                        <p className="font-medium text-slate-900">Certificate when renewal is due</p>
                        <p className="mt-1 text-sm text-slate-600">Keep certificates visible while payment is outstanding.</p>
                      </div>
                      <Switch checked={showCertificateWhenRenewalDue} onCheckedChange={setShowCertificateWhenRenewalDue} aria-label="Toggle certificate visibility when renewal is due" />
                    </CardContent>
                  </Card>
                ) : null}

                <Card className="rounded-2xl border-[color:var(--border-soft)] bg-white shadow-none">
                  <CardContent className="flex items-start justify-between gap-4 p-5">
                    <div>
                      <p className="font-medium text-slate-900">Membership card for active members</p>
                      <p className="mt-1 text-sm text-slate-600">Show cards while membership is current.</p>
                    </div>
                    <Switch checked={showMembershipCardToActiveMembers} onCheckedChange={setShowMembershipCardToActiveMembers} aria-label="Toggle membership card for active members" />
                  </CardContent>
                </Card>

                {renewalsEnabled && showMembershipCardToActiveMembers ? (
                  <Card className="rounded-2xl border-[color:var(--border-soft)] bg-white shadow-none">
                    <CardContent className="flex items-start justify-between gap-4 p-5">
                      <div>
                        <p className="font-medium text-slate-900">Membership card when renewal is due</p>
                        <p className="mt-1 text-sm text-slate-600">Keep cards visible while payment is outstanding.</p>
                      </div>
                      <Switch checked={showMembershipCardWhenRenewalDue} onCheckedChange={setShowMembershipCardWhenRenewalDue} aria-label="Toggle membership card visibility when renewal is due" />
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            </CardContent>
          </Card>
        );

      case 'review':
        return (
          <Card className="rounded-3xl border-[color:var(--border-soft)] bg-[var(--surface-elevated)] shadow-none">
            {renderStepHeader('review')}
            <CardContent className="space-y-5 p-5 pt-0">
              {renderStepAlerts('review')}

              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="rounded-2xl border-[color:var(--border-soft)] bg-white shadow-none">
                  <CardHeader className="p-5 pb-3">
                    <CardTitle className="text-sm font-medium text-slate-950">Portal decisions</CardTitle>
                    <CardDescription>The main choices applicants and members will feel first.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 p-5 pt-0 text-sm text-slate-700">
                    <div className="flex items-center justify-between gap-3">
                      <span>Brand</span>
                      <span className="font-medium text-slate-950">{shortName || setupName || 'Not set'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Applications</span>
                      <span className="font-medium text-slate-950">{portalFormOpen ? (isAcceptingApplications ? 'Open' : 'Open, but paused') : 'Closed'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Payment mode</span>
                      <span className="font-medium text-slate-950">{isMobilePayments ? 'Paybill payment' : 'Receipt upload'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Application total</span>
                      <span className="font-medium text-slate-950">{portalSetting?.currency ?? 'KES'} {applicationTotal.toLocaleString()}</span>
                    </div>
                    {renewalsEnabled ? (
                      <div className="flex items-center justify-between gap-3">
                        <span>Renewal total</span>
                        <span className="font-medium text-slate-950">{portalSetting?.currency ?? 'KES'} {renewalTotal.toLocaleString()}</span>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border-[color:var(--border-soft)] bg-white shadow-none">
                  <CardHeader className="p-5 pb-3">
                    <CardTitle className="text-sm font-medium text-slate-950">Member access</CardTitle>
                    <CardDescription>What approved members can still open after approval.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 p-5 pt-0 text-sm text-slate-700">
                    <div className="flex items-center justify-between gap-3">
                      <span>Application form</span>
                      <span className="font-medium text-slate-950">{showApplicationFormAfterApproval ? 'Visible after approval' : 'Hidden after approval'}</span>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <span className="text-sm text-slate-500">Application review</span>
                      <span className="font-medium text-slate-950">{applicationReviewMode === 'AUTO_APPROVE_VERIFIED_PAYMENTS' ? 'Auto-approve verified M-Pesa submissions' : 'Manual review'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Certificate</span>
                      <span className="font-medium text-slate-950">{showCertificateToActiveMembers ? 'Visible' : 'Hidden'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Membership card</span>
                      <span className="font-medium text-slate-950">{showMembershipCardToActiveMembers ? 'Visible' : 'Hidden'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Categories ready</span>
                      <span className="font-medium text-slate-950">{readiness.activeCategoryCount}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {!hasActiveCategories ? (
                <Alert className="rounded-2xl border-amber-200 bg-amber-50/70 text-slate-700">
                  <AlertCircle className="text-amber-600" />
                  <AlertTitle className="text-slate-900">One more thing</AlertTitle>
                  <AlertDescription className="text-slate-700">
                    Add at least one active membership category before opening the portal.
                    {!standaloneAssistant ? null : (
                      <Link href="/dashboard/settings#membership-categories" className="ml-1 font-medium text-[var(--brand)] underline underline-offset-4">
                        Open categories
                      </Link>
                    )}
                  </AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>
        );
    }
  }

  return (
    <div className="space-y-6">
      {!standaloneAssistant ? (
        <Card className="portal-surface-panel rounded-3xl border-[color:var(--border-soft)] shadow-none">
          <CardHeader className="p-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-lg font-medium text-slate-950">Portal readiness</CardTitle>
                <CardDescription className="mt-1 max-w-xl">
                  Check whether the application portal can open safely.
                </CardDescription>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  'rounded-full px-3 py-1 text-[11px] font-semibold',
                  readiness.isReady ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700',
                )}
              >
                {readiness.isReady ? 'Ready' : 'Needs attention'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 p-5 pt-0 sm:p-6 sm:pt-0">
            <div className="grid gap-3 md:grid-cols-3">
              <Card className="rounded-2xl border-[color:var(--border-soft)] bg-white shadow-none">
                <CardContent className="p-5">
                  <p className="portal-kicker text-slate-500">Active categories</p>
                  <p className="mt-3 text-3xl font-medium tracking-tight text-slate-950">{readiness.activeCategoryCount}</p>
                </CardContent>
              </Card>
              <Card className="rounded-2xl border-[color:var(--border-soft)] bg-white shadow-none">
                <CardContent className="p-5">
                  <p className="portal-kicker text-slate-500">Application total</p>
                  <p className="mt-3 text-3xl font-medium tracking-tight text-slate-950">
                    {readiness.paymentConfiguration.currency} {readiness.paymentConfiguration.totalAmount.toLocaleString()}
                  </p>
                </CardContent>
              </Card>
              <Card className="rounded-2xl border-[color:var(--border-soft)] bg-white shadow-none">
                <CardContent className="p-5">
                  <p className="portal-kicker text-slate-500">Blocking issues</p>
                  <p className="mt-3 text-3xl font-medium tracking-tight text-slate-950">{readiness.issues.length}</p>
                </CardContent>
              </Card>
            </div>

            {readiness.issues.length > 0 ? (
              <div className="space-y-3">
                {readiness.issues.map((issue) => (
                  <Alert key={issue.key} className="rounded-2xl border-amber-200 bg-amber-50/70 text-slate-700">
                    <AlertCircle className="text-amber-600" />
                    <AlertTitle className="text-slate-900">Needs attention</AlertTitle>
                    <AlertDescription className="text-slate-700">
                      <p>{issue.message}</p>
                      <Link href={issue.href} className="mt-1 text-sm font-medium text-[var(--brand)] underline underline-offset-4">
                        Open fix
                      </Link>
                    </AlertDescription>
                  </Alert>
                ))}
              </div>
            ) : (
              <Alert className="rounded-2xl border-emerald-200 bg-emerald-50/70 text-emerald-700">
                <CheckCircle2 className="text-emerald-700" />
                <AlertTitle className="text-emerald-700">Ready</AlertTitle>
                <AlertDescription className="text-emerald-700">No blocking issues right now.</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card id="setup-assistant" className="portal-surface-panel overflow-hidden rounded-[32px] border-[color:var(--border-soft)] shadow-none">
        <CardHeader className="border-b border-[color:var(--border-soft)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.95))] p-5 pb-5 sm:p-7">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-[var(--brand-soft)] p-3 text-[var(--brand)] ring-1 ring-[var(--brand-border)]/60">
                  <Settings2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="portal-kicker text-[var(--brand)]">Guided setup</p>
                  <CardTitle className="mt-2 text-2xl font-medium tracking-[-0.02em] text-slate-950">Portal setup assistant</CardTitle>
                  <CardDescription className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                    Use the same guided flow as the member wizards. Save each step, keep only relevant settings visible, and finish with a short launch review.
                  </CardDescription>
                </div>
              </div>
              <div className="grid min-w-[220px] gap-3 sm:grid-cols-2 lg:w-[280px] lg:grid-cols-1">
                <div className="rounded-2xl border border-[color:var(--border-soft)] bg-white/90 px-4 py-3">
                  <p className="portal-kicker text-slate-500">Step</p>
                  <p className="mt-2 text-lg font-medium text-slate-950">{currentStepIndex + 1} of {steps.length}</p>
                </div>
                <div className="rounded-2xl border border-[color:var(--border-soft)] bg-white/90 px-4 py-3">
                  <p className="portal-kicker text-slate-500">Ready steps</p>
                  <p className="mt-2 text-lg font-medium text-slate-950">{completedSteps} / {steps.length}</p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                <span>Progress</span>
                <span>{completionPercentage}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-[var(--brand)] transition-[width] duration-300" style={{ width: `${completionPercentage}%` }} />
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-5 sm:p-7">
          <form ref={formRef} action={portalAction} className="space-y-8">
            <input type="hidden" name="submitIntent" value={submitIntent} />
            <input type="hidden" name="currentStep" value={currentStep} />
            <input type="hidden" name="setupName" value={setupName} />
            <input type="hidden" name="shortName" value={shortName} />
            <input type="hidden" name="applicantMessage" value={applicantMessage} />
            <input type="hidden" name="applicationFee" value={applicationFee} />
            <input type="hidden" name="annualRenewalFee" value={annualRenewalFee} />
            <input type="hidden" name="includeRenewalFeeInApplication" value={includeRenewalFeeInApplication ? 'on' : 'off'} />
            <input type="hidden" name="taxPercentage" value={isTaxEnabled ? taxPercentage : ''} />
            <input type="hidden" name="manualPaymentInstructions" value={manualPaymentInstructions} />
            <input type="hidden" name="mpesaBusinessName" value={mpesaBusinessName} />
            <input type="hidden" name="mpesaPaybillNumber" value={mpesaPaybillNumber || mpesaShortCode} />
            <input type="hidden" name="mpesaShortCode" value={mpesaShortCode} />
            <input type="hidden" name="c2bShortCode" value={c2bShortCode || mpesaShortCode} />
            <input type="hidden" name="c2bValidationUrl" value={c2bStatus.validationUrl} />
            <input type="hidden" name="c2bConfirmationUrl" value={c2bStatus.confirmationUrl} />
            <input type="hidden" name="isFormOpen" value={portalFormOpen ? 'on' : 'off'} />
            <input type="hidden" name="isAcceptingApplications" value={isAcceptingApplications ? 'on' : 'off'} />
            <input type="hidden" name="paymentCollectionMode" value={paymentCollectionMode} />
            <input type="hidden" name="showApplicationFormAfterApproval" value={showApplicationFormAfterApproval ? 'on' : 'off'} />
            <input type="hidden" name="renewalsEnabled" value={renewalsEnabled ? 'on' : 'off'} />
            <input type="hidden" name="renewalMode" value={renewalMode} />
            <input type="hidden" name="renewalCoverageStartMonth" value={renewalCoverageStartMonth} />
            <input type="hidden" name="renewalCoverageStartDay" value={renewalCoverageStartDay} />
            <input type="hidden" name="renewalCoverageEndMonth" value={renewalCoverageEndMonth} />
            <input type="hidden" name="renewalCoverageEndDay" value={renewalCoverageEndDay} />
            <input type="hidden" name="renewalGraceDays" value={renewalGraceDays} />
            <input type="hidden" name="renewalReminderLeadDays" value={renewalReminderLeadDays} />
            <input type="hidden" name="renewalReminderFrequency" value={renewalReminderFrequency} />
            <input type="hidden" name="showCertificateToActiveMembers" value={showCertificateToActiveMembers ? 'on' : 'off'} />
            <input type="hidden" name="showCertificateWhenRenewalDue" value={showCertificateWhenRenewalDue ? 'on' : 'off'} />
            <input type="hidden" name="showMembershipCardToActiveMembers" value={showMembershipCardToActiveMembers ? 'on' : 'off'} />
            <input type="hidden" name="showMembershipCardWhenRenewalDue" value={showMembershipCardWhenRenewalDue ? 'on' : 'off'} />
            <input type="hidden" name="isTaxEnabled" value={isTaxEnabled ? 'on' : 'off'} />
            <input type="hidden" name="darajaTransactionType" value="CustomerPayBillOnline" />
            <input type="hidden" name="isC2BEnabled" value={isMobilePayments ? 'on' : 'off'} />
            <input type="hidden" name="c2bResponseType" value={c2bResponseType} />

            <div className="space-y-6">
              <div className="rounded-[28px] border border-[color:var(--border-soft)] bg-[var(--surface-elevated)] p-4 sm:p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-950">Setup steps</p>
                    <p className="text-sm leading-6 text-slate-600">Move across the setup from left to right. Only relevant steps stay visible.</p>
                  </div>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                    {completedSteps} ready of {steps.length}
                  </p>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                  {steps.map((step, index) => {
                    const blockers = stepBlockers[step.id];
                    const isCurrent = currentStep === step.id;
                    const Icon = step.icon;
                    const isReady = blockers.length === 0;
                    const isCompleted = index < currentStepIndex && isReady;

                    return (
                      <button
                        key={step.id}
                        type="button"
                        onClick={() => setCurrentStep(step.id)}
                        className={cn(
                          'rounded-2xl border px-4 py-4 text-left transition-all',
                          isCurrent
                            ? 'border-[var(--brand-border)] bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)]'
                            : 'border-[color:var(--border-soft)] bg-white/80 hover:bg-white',
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className={cn(
                            'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border',
                            isCurrent
                              ? 'border-[var(--brand-border)] bg-[var(--brand-soft)] text-[var(--brand)]'
                              : isCompleted
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-slate-200 bg-white text-slate-500',
                          )}>
                            {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                          </div>
                          <span className={cn(
                            'rounded-full px-2.5 py-1 text-[10px] font-semibold',
                            isCurrent
                              ? 'bg-[var(--brand-soft)] text-[var(--brand)]'
                              : isReady
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-amber-50 text-amber-700',
                          )}>
                            {isCurrent ? 'Current' : isReady ? 'Ready' : blockers.length}
                          </span>
                        </div>
                        <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Step {index + 1}</p>
                        <p className="mt-2 text-sm font-medium text-slate-950">{step.label}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-600">{step.title}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4">
                {renderStepContent()}
              </div>

              <Card className="rounded-[28px] border-[color:var(--border-soft)] bg-white shadow-none">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
                  <div className="flex flex-wrap gap-2">
                    {previousStep ? (
                      <Button type="button" variant="outline" className="rounded-xl" onClick={() => setCurrentStep(previousStep as WizardStep)}>
                        <ChevronLeft className="mr-2 h-4 w-4" />
                        Previous
                      </Button>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {nextStep ? (
                      <Button
                        type="button"
                        className="rounded-xl"
                        disabled={currentBlockers.length > 0}
                        onClick={() => {
                          setSubmitIntent('SAVE');
                          setPendingNextStep(nextStep as WizardStep);
                          formRef.current?.requestSubmit();
                        }}
                      >
                        Save and continue
                        <ChevronRight className="ml-2 h-4 w-4" />
                      </Button>
                    ) : null}

                    {currentStep === 'review' ? (
                      <>
                        <Button type="submit" variant="outline" className="rounded-xl" onClick={() => setSubmitIntent('SAVE')}>
                          Finish later
                        </Button>
                        <Button type="submit" className="rounded-xl" onClick={() => setSubmitIntent('OPEN')} disabled={reviewBlockers.length > 0}>
                          Finish and open portal
                        </Button>
                      </>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </div>
          </form>
        </CardContent>
      </Card>

      {!standaloneAssistant ? (
        <Card id="membership-categories" className="portal-surface-panel rounded-3xl border-[color:var(--border-soft)] shadow-none">
          <CardHeader className="p-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-[var(--brand-soft)] p-3 text-[var(--brand)]">
                <Tags className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg font-medium text-slate-950">Membership categories</CardTitle>
                <CardDescription className="mt-1 max-w-xl">Manage the category options shown on the application form.</CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6 p-5 pt-0 sm:p-6 sm:pt-0">
            <Card className="rounded-3xl border-[color:var(--border-soft)] bg-[var(--surface-elevated)] shadow-none">
              <CardContent className="p-5">
                <form action={categoryAction} className="grid gap-5 lg:grid-cols-2">
                  <input type="hidden" name="isActive" value={newCategoryIsActive ? 'on' : 'off'} />

                  <Field>
                    <FieldLabel htmlFor="name" required>Category name</FieldLabel>
                    <Input id="name" name="name" placeholder="Full member" required />
                    <FieldDescription>Label shown to applicants.</FieldDescription>
                    <FieldError>{categoryState.fieldErrors?.name?.[0]}</FieldError>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="displayOrder">Display order</FieldLabel>
                    <Input id="displayOrder" name="displayOrder" type="number" min="0" defaultValue="0" />
                    <FieldDescription>Lower numbers appear first.</FieldDescription>
                    <FieldError>{categoryState.fieldErrors?.displayOrder?.[0]}</FieldError>
                  </Field>
                  <Field className="lg:col-span-2">
                    <FieldLabel htmlFor="description">Description</FieldLabel>
                    <Textarea id="description" name="description" placeholder="Optional admin note for this category." className="min-h-24" />
                    <FieldDescription>Internal context only.</FieldDescription>
                  </Field>
                  <Card className="lg:col-span-2 rounded-2xl border-[color:var(--border-soft)] bg-white shadow-none">
                    <CardContent className="flex items-start justify-between gap-4 p-5 text-sm text-slate-700">
                      <div>
                        <p className="font-medium text-slate-900">Available immediately</p>
                        <p className="mt-1 text-slate-600">Inactive categories stay in admin records but do not appear on the form.</p>
                      </div>
                      <Switch checked={newCategoryIsActive} onCheckedChange={setNewCategoryIsActive} aria-label="Make category active" />
                    </CardContent>
                  </Card>
                  <div className="lg:col-span-2">
                    <Button type="submit">Add category</Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <div className="space-y-3">
              {categories.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">No membership categories configured yet.</div>
              ) : (
                categories.map((category) => {
                  const toggleAction = setMembershipCategoryStatus.bind(null, category.id, !category.isActive);

                  return (
                    <Card key={category.id} className="rounded-2xl border-[color:var(--border-soft)] bg-white shadow-none">
                      <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-3">
                            <h4 className="text-base font-medium text-slate-950">{category.name}</h4>
                            <Badge variant="outline" className={cn('rounded-full px-3 py-1 text-[11px] font-semibold', category.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600')}>
                              {category.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                            <span className="text-xs uppercase tracking-[0.14em] text-slate-400">Order {category.displayOrder}</span>
                          </div>
                          <p className="max-w-3xl text-sm text-slate-600">{category.description || 'No internal description added.'}</p>
                          <p className="text-xs text-slate-500">Used by {category._count.applications} application{category._count.applications === 1 ? '' : 's'}.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <form action={toggleAction}>
                            <Button type="submit" variant="outline">{category.isActive ? 'Disable' : 'Enable'}</Button>
                          </form>
                          {category._count.applications === 0 ? (
                            <form action={deleteMembershipCategory.bind(null, category.id)}>
                              <Button type="submit" variant="outline" className="border-rose-200 text-rose-700 hover:border-rose-300 hover:bg-rose-50">Delete</Button>
                            </form>
                          ) : null}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}



