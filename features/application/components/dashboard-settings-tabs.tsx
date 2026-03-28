'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ApplicationSettingsPanel } from '@/features/application/components/application-settings-panel';
import { DarajaSettingsPanel } from '@/features/payments/components/daraja-settings-panel';
import type { PaymentConfiguration, PortalReadinessIssue } from '@/features/application/queries/settings';
import type { MpesaRequestStatus } from '@/features/payments/lib/daraja-result';

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

type DarajaStatus = {
  environment: 'sandbox' | 'production';
  callbackUrl: string;
  baseUrl: string;
  transactionType: 'CustomerPayBillOnline' | 'CustomerBuyGoodsOnline';
  isConfigured: boolean;
  missing: string[];
};

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

type Props = {
  portalSetting: PortalSettingItem;
  readiness: {
    isReady: boolean;
    issues: PortalReadinessIssue[];
    activeCategoryCount: number;
    paymentConfiguration: PaymentConfiguration;
  };
  categories: MembershipCategoryItem[];
  openSetupAssistant?: boolean;
  darajaStatus: DarajaStatus;
  c2bStatus: C2BStatus;
  applicationOptions: ApplicationOption[];
  recentRequests: RecentRequest[];
};

export function DashboardSettingsTabs({
  portalSetting,
  readiness,
  categories,
  openSetupAssistant = false,
  darajaStatus,
  c2bStatus,
  applicationOptions,
  recentRequests,
}: Props) {
  return (
    <Tabs defaultValue="portal" className="space-y-5">
      <TabsList className="w-fit rounded-xl bg-slate-100/90 p-1">
        <TabsTrigger value="portal" className="rounded-lg px-4">Portal setup</TabsTrigger>
        <TabsTrigger value="payments" className="rounded-lg px-4">Payment operations</TabsTrigger>
      </TabsList>
      <TabsContent value="portal" className="mt-0">
        <ApplicationSettingsPanel
          portalSetting={portalSetting}
          c2bStatus={c2bStatus}
          readiness={readiness}
          categories={categories}
          startInWizard={openSetupAssistant}
        />
      </TabsContent>
      <TabsContent value="payments" className="mt-0">
        <DarajaSettingsPanel
          status={darajaStatus}
          applicationOptions={applicationOptions}
          recentRequests={recentRequests}
        />
      </TabsContent>
    </Tabs>
  );
}
