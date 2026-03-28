'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { auth } from '@/auth';
import { DEFAULT_ORGANIZATION_NAME, DEFAULT_ORGANIZATION_SHORT_NAME } from '@/features/application/lib/portal-branding';
import { registerDarajaC2BUrls } from '@/features/payments/lib/daraja';
import { db } from '@/lib/db';

const wizardValidationSteps = ['intake', 'payments', 'paybill', 'renewals', 'documents', 'review'] as const;
type WizardValidationStep = (typeof wizardValidationSteps)[number];

function hasReachedStep(currentStep: WizardValidationStep, targetStep: WizardValidationStep) {
  return wizardValidationSteps.indexOf(currentStep) >= wizardValidationSteps.indexOf(targetStep);
}

export type SettingsActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

const categorySchema = z.object({
  categoryId: z.string().trim().optional(),
  name: z.string().trim().min(1, 'Category name is required'),
  description: z.string().trim().optional(),
  displayOrder: z.coerce.number().int().min(0, 'Display order must be zero or higher').default(0),
  isActive: z.boolean().default(true),
});

const portalSettingSchema = z
  .object({
    setupName: z.string().trim().min(1, 'Organisation name is required').max(120, 'Organisation name must be 120 characters or fewer'),
    shortName: z.string().trim().min(1, 'Short name is required').max(20, 'Short name must be 20 characters or fewer'),
    submitIntent: z.enum(['SAVE', 'OPEN']).default('SAVE'),
    currentStep: z.enum(wizardValidationSteps).default('review'),
    isFormOpen: z.boolean().default(false),
    isAcceptingApplications: z.boolean().default(false),
    showApplicationFormAfterApproval: z.boolean().default(false),
    applicationReviewMode: z.enum(['MANUAL_REVIEW', 'AUTO_APPROVE_VERIFIED_PAYMENTS']).default('MANUAL_REVIEW'),
    renewalsEnabled: z.boolean().default(false),
    renewalMode: z.enum(['MANUAL_REVIEW', 'PAY_AND_ACTIVATE']).default('MANUAL_REVIEW'),
    renewalCoverageStartMonth: z.coerce.number().int().min(1, 'Coverage start month must be between 1 and 12').max(12, 'Coverage start month must be between 1 and 12').default(1),
    renewalCoverageStartDay: z.coerce.number().int().min(1, 'Coverage start day must be between 1 and 31').max(31, 'Coverage start day must be between 1 and 31').default(1),
    renewalCoverageEndMonth: z.coerce.number().int().min(1, 'Coverage end month must be between 1 and 12').max(12, 'Coverage end month must be between 1 and 12').default(12),
    renewalCoverageEndDay: z.coerce.number().int().min(1, 'Coverage end day must be between 1 and 31').max(31, 'Coverage end day must be between 1 and 31').default(31),
    renewalGraceDays: z.coerce.number().int().min(0, 'Grace days must be zero or higher').max(365, 'Grace days cannot exceed 365').default(0),
    renewalReminderLeadDays: z.coerce.number().int().min(0, 'Reminder lead days must be zero or higher').max(365, 'Reminder lead days cannot exceed 365').default(30),
    renewalReminderFrequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']).default('WEEKLY'),
    annualRenewalFee: z.coerce.number().int().min(0, 'Renewal fee must be zero or higher').default(0),
    includeRenewalFeeInApplication: z.boolean().default(false),
    showCertificateToActiveMembers: z.boolean().default(true),
    showCertificateWhenRenewalDue: z.boolean().default(false),
    showMembershipCardToActiveMembers: z.boolean().default(true),
    showMembershipCardWhenRenewalDue: z.boolean().default(false),
    applicantMessage: z.string().trim().max(500, 'Applicant message must be 500 characters or fewer').optional(),
    paymentCollectionMode: z.enum(['MANUAL_PROOF', 'MPESA_DARAJA']).default('MANUAL_PROOF'),
    applicationFee: z.coerce.number().int().min(0, 'Application fee must be zero or higher').default(0),
    isTaxEnabled: z.boolean().default(false),
    taxPercentage: z.coerce.number().int().min(0, 'Tax percentage must be zero or higher').max(100, 'Tax percentage cannot exceed 100').optional(),
    currency: z.string().trim().min(3).max(3).default('KES'),
    manualPaymentInstructions: z.string().trim().max(1000, 'Manual payment instructions must be 1000 characters or fewer').optional(),
    mpesaBusinessName: z.string().trim().max(120, 'Business name must be 120 characters or fewer').optional(),
    mpesaPaybillNumber: z.string().trim().max(20, 'Paybill number must be 20 characters or fewer').optional(),
    mpesaShortCode: z.string().trim().max(20, 'Short code must be 20 characters or fewer').optional(),
    darajaTransactionType: z.enum(['CustomerPayBillOnline', 'CustomerBuyGoodsOnline']).default('CustomerPayBillOnline'),
    isC2BEnabled: z.boolean().default(true),
    c2bShortCode: z.string().trim().max(20, 'C2B short code must be 20 characters or fewer').optional(),
    c2bValidationUrl: z.string().trim().url('Validation URL must be a valid URL').optional(),
    c2bConfirmationUrl: z.string().trim().url('Confirmation URL must be a valid URL').optional(),
    c2bResponseType: z.enum(['Completed', 'Cancelled']).default('Completed'),
  })
  .superRefine((values, ctx) => {
    const needsPaymentsStep = values.submitIntent === 'OPEN' || hasReachedStep(values.currentStep, 'payments');
    const needsPaybillStep = values.paymentCollectionMode === 'MPESA_DARAJA' && (values.submitIntent === 'OPEN' || hasReachedStep(values.currentStep, 'paybill'));
    const needsRenewalStep = values.renewalsEnabled && (values.submitIntent === 'OPEN' || hasReachedStep(values.currentStep, 'renewals'));

    if (needsPaymentsStep && values.applicationFee <= 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['applicationFee'],
        message: 'Enter an application fee before continuing.',
      });
    }

    if (values.isTaxEnabled && needsPaymentsStep && (!values.taxPercentage || values.taxPercentage <= 0)) {
      ctx.addIssue({
        code: 'custom',
        path: ['taxPercentage'],
        message: 'Enter a tax percentage when tax is enabled.',
      });
    }

    if (values.paymentCollectionMode === 'MANUAL_PROOF' && needsPaymentsStep && !values.manualPaymentInstructions?.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['manualPaymentInstructions'],
        message: 'Add receipt upload instructions before continuing.',
      });
    }

    if (needsPaybillStep) {
      if (!values.c2bShortCode?.trim()) {
        ctx.addIssue({ code: 'custom', path: ['c2bShortCode'], message: 'Callback short code is required for paybill updates.' });
      }
      if (!values.c2bValidationUrl?.trim()) {
        ctx.addIssue({ code: 'custom', path: ['c2bValidationUrl'], message: 'Validation URL is required for paybill updates.' });
      }
      if (!values.c2bConfirmationUrl?.trim()) {
        ctx.addIssue({ code: 'custom', path: ['c2bConfirmationUrl'], message: 'Confirmation URL is required for paybill updates.' });
      }
      if (!values.mpesaBusinessName?.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['mpesaBusinessName'],
          message: 'Paybill business name is required before continuing.',
        });
      }
      if (!values.mpesaPaybillNumber?.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['mpesaPaybillNumber'],
          message: 'Paybill number is required before continuing.',
        });
      }
      if (!values.mpesaShortCode?.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['mpesaShortCode'],
          message: 'Short code is required before continuing.',
        });
      } else if (values.mpesaShortCode.trim() === '123456') {
        ctx.addIssue({
          code: 'custom',
          path: ['mpesaShortCode'],
          message: 'Replace the placeholder short code with your real payment short code.',
        });
      }
    }

    if (needsRenewalStep && values.annualRenewalFee <= 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['annualRenewalFee'],
        message: 'Enter a renewal fee before enabling annual renewals.',
      });
    }

    if (needsRenewalStep) {
      const startDate = new Date(Date.UTC(2024, values.renewalCoverageStartMonth - 1, values.renewalCoverageStartDay));
      const endReferenceYear = values.renewalCoverageEndMonth < values.renewalCoverageStartMonth
        || (values.renewalCoverageEndMonth == values.renewalCoverageStartMonth && values.renewalCoverageEndDay < values.renewalCoverageStartDay)
        ? 2025
        : 2024;
      const endDate = new Date(Date.UTC(endReferenceYear, values.renewalCoverageEndMonth - 1, values.renewalCoverageEndDay));

      if (Number.isNaN(startDate.getTime())) {
        ctx.addIssue({ code: 'custom', path: ['renewalCoverageStartDay'], message: 'Enter a valid coverage start date.' });
      }

      if (Number.isNaN(endDate.getTime())) {
        ctx.addIssue({ code: 'custom', path: ['renewalCoverageEndDay'], message: 'Enter a valid coverage end date.' });
      }
    }

    if (needsRenewalStep && values.renewalReminderLeadDays < 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['renewalReminderLeadDays'],
        message: 'Reminder lead days must be zero or higher.',
      });
    }
  });

function slugifyCategoryName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

async function requireAdmin() {
  const session = await auth();

  if (!session?.user?.id || session.user.role !== 'ADMIN') {
    throw new Error('Unauthorized');
  }

  return session.user.id;
}

function revalidateSettingsViews() {
  revalidatePath('/apply');
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/settings');
  revalidatePath('/dashboard/setup-assistant');
  revalidatePath('/dashboard/certificate');
  revalidatePath('/dashboard/card');
  revalidatePath('/profile');
}

function isInvalidPublicCallbackUrl(url: string) {
  return !url.startsWith('https://') || /localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\./.test(url);
}

export async function saveMembershipCategory(
  _prevState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  await requireAdmin();

  const parsed = categorySchema.safeParse({
    categoryId: formData.get('categoryId') || undefined,
    name: formData.get('name'),
    description: formData.get('description') || undefined,
    displayOrder: formData.get('displayOrder') || 0,
    isActive: formData.get('isActive') === 'on',
  });

  if (!parsed.success) {
    return {
      error: 'Please correct the category details and try again.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const values = parsed.data;
  const slug = slugifyCategoryName(values.name);

  if (!slug) {
    return {
      error: 'Category name must contain letters or numbers.',
      fieldErrors: { name: ['Category name must contain letters or numbers.'] },
    };
  }

  const duplicate = await db.membershipCategory.findFirst({
    where: {
      OR: [{ name: values.name }, { slug }],
      NOT: values.categoryId ? { id: values.categoryId } : undefined,
    },
    select: { id: true },
  });

  if (duplicate) {
    return {
      error: 'That membership category already exists.',
      fieldErrors: { name: ['Use a unique category name.'] },
    };
  }

  if (values.categoryId) {
    await db.membershipCategory.update({
      where: { id: values.categoryId },
      data: {
        name: values.name,
        slug,
        description: values.description || null,
        displayOrder: values.displayOrder,
        isActive: values.isActive,
      },
    });
  } else {
    await db.membershipCategory.create({
      data: {
        name: values.name,
        slug,
        description: values.description || null,
        displayOrder: values.displayOrder,
        isActive: values.isActive,
      },
    });
  }

  revalidateSettingsViews();

  return { success: values.categoryId ? 'Membership category updated.' : 'Membership category created.' };
}

export async function setMembershipCategoryStatus(categoryId: string, isActive: boolean) {
  await requireAdmin();

  await db.membershipCategory.update({
    where: { id: categoryId },
    data: { isActive },
  });

  revalidateSettingsViews();
}

export async function deleteMembershipCategory(categoryId: string) {
  await requireAdmin();

  const category = await db.membershipCategory.findUnique({
    where: { id: categoryId },
    select: {
      id: true,
      _count: {
        select: { applications: true },
      },
    },
  });

  if (!category || category._count.applications > 0) {
    return;
  }

  await db.membershipCategory.delete({
    where: { id: categoryId },
  });

  revalidateSettingsViews();
}

export async function saveApplicationPortalSetting(
  _prevState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const adminId = await requireAdmin();

  const parsed = portalSettingSchema.safeParse({
    setupName: formData.get('setupName') || '',
    shortName: formData.get('shortName') || '',
    submitIntent: formData.get('submitIntent') || 'SAVE',
    currentStep: formData.get('currentStep') || 'review',
    isFormOpen: formData.get('isFormOpen') === 'on',
    isAcceptingApplications: formData.get('isAcceptingApplications') === 'on',
    showApplicationFormAfterApproval: formData.get('showApplicationFormAfterApproval') === 'on',
    applicationReviewMode: formData.get('applicationReviewMode') || 'MANUAL_REVIEW',
    renewalsEnabled: formData.get('renewalsEnabled') === 'on',
    renewalMode: formData.get('renewalMode') || 'MANUAL_REVIEW',
    renewalCoverageStartMonth: formData.get('renewalCoverageStartMonth') || 1,
    renewalCoverageStartDay: formData.get('renewalCoverageStartDay') || 1,
    renewalCoverageEndMonth: formData.get('renewalCoverageEndMonth') || 12,
    renewalCoverageEndDay: formData.get('renewalCoverageEndDay') || 31,
    renewalGraceDays: formData.get('renewalGraceDays') || 0,
    renewalReminderLeadDays: formData.get('renewalReminderLeadDays') || 30,
    renewalReminderFrequency: formData.get('renewalReminderFrequency') || 'WEEKLY',
    annualRenewalFee: formData.get('annualRenewalFee') || 0,
    includeRenewalFeeInApplication: formData.get('includeRenewalFeeInApplication') === 'on',
    showCertificateToActiveMembers: formData.get('showCertificateToActiveMembers') === 'on',
    showCertificateWhenRenewalDue: formData.get('showCertificateWhenRenewalDue') === 'on',
    showMembershipCardToActiveMembers: formData.get('showMembershipCardToActiveMembers') === 'on',
    showMembershipCardWhenRenewalDue: formData.get('showMembershipCardWhenRenewalDue') === 'on',
    applicantMessage: formData.get('applicantMessage') || undefined,
    paymentCollectionMode: formData.get('paymentCollectionMode') || 'MANUAL_PROOF',
    applicationFee: formData.get('applicationFee') || 0,
    isTaxEnabled: formData.get('isTaxEnabled') === 'on',
    taxPercentage: formData.get('taxPercentage') || undefined,
    currency: formData.get('currency') || 'KES',
    manualPaymentInstructions: formData.get('manualPaymentInstructions') || undefined,
    mpesaBusinessName: formData.get('mpesaBusinessName') || undefined,
    mpesaPaybillNumber: formData.get('mpesaPaybillNumber') || undefined,
    mpesaShortCode: formData.get('mpesaShortCode') || undefined,
    darajaTransactionType: formData.get('darajaTransactionType') || 'CustomerPayBillOnline',
    isC2BEnabled: formData.get('isC2BEnabled') === 'on',
    c2bShortCode: formData.get('c2bShortCode') || undefined,
    c2bValidationUrl: formData.get('c2bValidationUrl') || undefined,
    c2bConfirmationUrl: formData.get('c2bConfirmationUrl') || undefined,
    c2bResponseType: formData.get('c2bResponseType') || 'Completed',
  });

  if (!parsed.success) {
    return {
      error: 'Please correct the portal settings and try again.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const values = parsed.data;
  const shouldOpenPortal = values.submitIntent === 'OPEN';
  const configuredShortCode = (process.env.DARAJA_SHORTCODE ?? '').trim() || values.c2bShortCode?.trim() || values.mpesaShortCode?.trim() || values.mpesaPaybillNumber?.trim() || null;
  const configuredValidationUrl = (process.env.DARAJA_C2B_VALIDATION_URL ?? '').trim() || values.c2bValidationUrl?.trim() || null;
  const configuredConfirmationUrl = (process.env.DARAJA_C2B_CONFIRMATION_URL ?? '').trim() || values.c2bConfirmationUrl?.trim() || null;
  const configuredResponseType = ((process.env.DARAJA_C2B_RESPONSE_TYPE ?? '').trim() as 'Completed' | 'Cancelled' | '') || values.c2bResponseType;
  const darajaEnvironment = (process.env.DARAJA_ENVIRONMENT ?? 'sandbox').trim();
  const shouldAutoRegisterPaybill =
    values.paymentCollectionMode === 'MPESA_DARAJA' &&
    values.currentStep === 'paybill';

  await db.applicationPortalSetting.upsert({
    where: { singletonKey: 'default' },
    update: {
      setupName: values.setupName || DEFAULT_ORGANIZATION_NAME,
      shortName: values.shortName || DEFAULT_ORGANIZATION_SHORT_NAME,
      isFormOpen: shouldOpenPortal ? true : values.isFormOpen,
      isAcceptingApplications: shouldOpenPortal ? true : values.isAcceptingApplications,
      showApplicationFormAfterApproval: values.showApplicationFormAfterApproval,
      applicationReviewMode: values.applicationReviewMode,
      renewalsEnabled: values.renewalsEnabled,
      renewalMode: values.renewalMode,
      renewalCoverageStartMonth: values.renewalsEnabled ? values.renewalCoverageStartMonth : 1,
      renewalCoverageStartDay: values.renewalsEnabled ? values.renewalCoverageStartDay : 1,
      renewalCoverageEndMonth: values.renewalsEnabled ? values.renewalCoverageEndMonth : 12,
      renewalCoverageEndDay: values.renewalsEnabled ? values.renewalCoverageEndDay : 31,
      renewalGraceDays: values.renewalsEnabled ? values.renewalGraceDays : 0,
      renewalReminderLeadDays: values.renewalsEnabled ? values.renewalReminderLeadDays : 30,
      renewalReminderFrequency: values.renewalsEnabled ? values.renewalReminderFrequency : 'WEEKLY',
      annualRenewalFee: values.renewalsEnabled ? values.annualRenewalFee : 0,
      includeRenewalFeeInApplication: values.renewalsEnabled ? values.includeRenewalFeeInApplication : false,
      showCertificateToActiveMembers: values.showCertificateToActiveMembers,
      showCertificateWhenRenewalDue: values.showCertificateWhenRenewalDue,
      showMembershipCardToActiveMembers: values.showMembershipCardToActiveMembers,
      showMembershipCardWhenRenewalDue: values.showMembershipCardWhenRenewalDue,
      applicantMessage: values.applicantMessage || null,
      paymentCollectionMode: values.paymentCollectionMode,
      applicationFee: values.applicationFee,
      isTaxEnabled: values.isTaxEnabled,
      taxPercentage: values.isTaxEnabled ? values.taxPercentage ?? 0 : null,
      currency: values.currency.toUpperCase(),
      manualPaymentInstructions: values.manualPaymentInstructions || null,
      mpesaBusinessName: values.mpesaBusinessName || null,
      mpesaPaybillNumber: values.paymentCollectionMode === 'MPESA_DARAJA' ? configuredShortCode : null,
      mpesaShortCode: values.paymentCollectionMode === 'MPESA_DARAJA' ? configuredShortCode : null,
      darajaTransactionType: values.paymentCollectionMode === 'MPESA_DARAJA' ? values.darajaTransactionType : null,
      isC2BEnabled: values.paymentCollectionMode === 'MPESA_DARAJA',
      c2bShortCode: values.paymentCollectionMode === 'MPESA_DARAJA' ? configuredShortCode : null,
      c2bValidationUrl: values.paymentCollectionMode === 'MPESA_DARAJA' ? configuredValidationUrl : null,
      c2bConfirmationUrl: values.paymentCollectionMode === 'MPESA_DARAJA' ? configuredConfirmationUrl : null,
      c2bResponseType: values.paymentCollectionMode === 'MPESA_DARAJA' ? configuredResponseType : null,
      updatedById: adminId,
    },
    create: {
      singletonKey: 'default',
      setupName: values.setupName || DEFAULT_ORGANIZATION_NAME,
      shortName: values.shortName || DEFAULT_ORGANIZATION_SHORT_NAME,
      isFormOpen: shouldOpenPortal ? true : values.isFormOpen,
      isAcceptingApplications: shouldOpenPortal ? true : values.isAcceptingApplications,
      showApplicationFormAfterApproval: values.showApplicationFormAfterApproval,
      applicationReviewMode: values.applicationReviewMode,
      renewalsEnabled: values.renewalsEnabled,
      renewalMode: values.renewalMode,
      renewalCoverageStartMonth: values.renewalsEnabled ? values.renewalCoverageStartMonth : 1,
      renewalCoverageStartDay: values.renewalsEnabled ? values.renewalCoverageStartDay : 1,
      renewalCoverageEndMonth: values.renewalsEnabled ? values.renewalCoverageEndMonth : 12,
      renewalCoverageEndDay: values.renewalsEnabled ? values.renewalCoverageEndDay : 31,
      renewalGraceDays: values.renewalsEnabled ? values.renewalGraceDays : 0,
      renewalReminderLeadDays: values.renewalsEnabled ? values.renewalReminderLeadDays : 30,
      renewalReminderFrequency: values.renewalsEnabled ? values.renewalReminderFrequency : 'WEEKLY',
      annualRenewalFee: values.renewalsEnabled ? values.annualRenewalFee : 0,
      includeRenewalFeeInApplication: values.renewalsEnabled ? values.includeRenewalFeeInApplication : false,
      showCertificateToActiveMembers: values.showCertificateToActiveMembers,
      showCertificateWhenRenewalDue: values.showCertificateWhenRenewalDue,
      showMembershipCardToActiveMembers: values.showMembershipCardToActiveMembers,
      showMembershipCardWhenRenewalDue: values.showMembershipCardWhenRenewalDue,
      applicantMessage: values.applicantMessage || null,
      paymentCollectionMode: values.paymentCollectionMode,
      applicationFee: values.applicationFee,
      isTaxEnabled: values.isTaxEnabled,
      taxPercentage: values.isTaxEnabled ? values.taxPercentage ?? 0 : null,
      currency: values.currency.toUpperCase(),
      manualPaymentInstructions: values.manualPaymentInstructions || null,
      mpesaBusinessName: values.mpesaBusinessName || null,
      mpesaPaybillNumber: values.paymentCollectionMode === 'MPESA_DARAJA' ? configuredShortCode : null,
      mpesaShortCode: values.paymentCollectionMode === 'MPESA_DARAJA' ? configuredShortCode : null,
      darajaTransactionType: values.paymentCollectionMode === 'MPESA_DARAJA' ? values.darajaTransactionType : null,
      isC2BEnabled: values.isC2BEnabled,
      c2bShortCode: values.paymentCollectionMode === 'MPESA_DARAJA' ? configuredShortCode : null,
      c2bValidationUrl: values.paymentCollectionMode === 'MPESA_DARAJA' ? configuredValidationUrl : null,
      c2bConfirmationUrl: values.paymentCollectionMode === 'MPESA_DARAJA' ? configuredConfirmationUrl : null,
      c2bResponseType: values.paymentCollectionMode === 'MPESA_DARAJA' ? configuredResponseType : null,
      updatedById: adminId,
    },
  });

  if (shouldAutoRegisterPaybill) {
    const validationUrl = configuredValidationUrl?.trim() ?? '';
    const confirmationUrl = configuredConfirmationUrl?.trim() ?? '';

    if (isInvalidPublicCallbackUrl(validationUrl)) {
      return {
        error: 'The validation link must be a public https URL before paybill setup can be completed.',
      };
    }

    if (isInvalidPublicCallbackUrl(confirmationUrl)) {
      return {
        error: 'The confirmation link must be a public https URL before paybill setup can be completed.',
      };
    }

    if (darajaEnvironment === 'sandbox') {
      await db.applicationPortalSetting.update({
        where: { singletonKey: 'default' },
        data: {
          c2bRegisteredAt: null,
          c2bLastRegistrationNote: 'Sandbox mode active. Direct paybill URL registration was skipped; STK paybill testing can continue.',
        },
      });
    } else {
      try {
        const registration = await registerDarajaC2BUrls({
          shortCode: configuredShortCode,
          validationUrl: configuredValidationUrl,
          confirmationUrl: configuredConfirmationUrl,
          responseType: configuredResponseType,
        });

        await db.applicationPortalSetting.update({
          where: { singletonKey: 'default' },
          data: {
            c2bRegisteredAt: new Date(),
            c2bLastRegistrationNote: registration.response.ResponseDescription ?? 'Safaricom paybill links registered successfully.',
          },
        });
      } catch (error) {
        await db.applicationPortalSetting.update({
          where: { singletonKey: 'default' },
          data: {
            c2bLastRegistrationNote: error instanceof Error ? error.message : 'Unable to register the Safaricom paybill links right now.',
          },
        });

        return {
          error: error instanceof Error ? error.message : 'Unable to complete paybill registration right now.',
        };
      }
    }
  }

  revalidateSettingsViews();

  return { success: 'Application portal settings updated.' };
}

export async function registerApplicationC2BUrls(_prevState: SettingsActionState): Promise<SettingsActionState> {
  try {
    await requireAdmin();

    const setting = await db.applicationPortalSetting.findUnique({
      where: { singletonKey: 'default' },
      select: {
        c2bShortCode: true,
        c2bValidationUrl: true,
        c2bConfirmationUrl: true,
        c2bResponseType: true,
        isC2BEnabled: true,
      },
    });

    if (!setting?.isC2BEnabled) {
      throw new Error('Turn on paybill payment before registering the Safaricom links.');
    }

    const validationUrl = setting.c2bValidationUrl?.trim() ?? '';
    const confirmationUrl = setting.c2bConfirmationUrl?.trim() ?? '';
    if (isInvalidPublicCallbackUrl(validationUrl)) {
      throw new Error('The validation link must be a public https URL before you register with Safaricom.');
    }

    if (isInvalidPublicCallbackUrl(confirmationUrl)) {
      throw new Error('The confirmation link must be a public https URL before you register with Safaricom.');
    }

    const registration = await registerDarajaC2BUrls({
      shortCode: setting.c2bShortCode,
      validationUrl: setting.c2bValidationUrl,
      confirmationUrl: setting.c2bConfirmationUrl,
      responseType: (setting.c2bResponseType as 'Completed' | 'Cancelled' | null) ?? 'Completed',
    });

    await db.applicationPortalSetting.update({
      where: { singletonKey: 'default' },
      data: {
        c2bRegisteredAt: new Date(),
        c2bLastRegistrationNote: registration.response.ResponseDescription ?? 'Safaricom paybill links registered successfully.',
      },
    });

    revalidateSettingsViews();

    return {
      success: registration.response.ResponseDescription ?? 'Safaricom paybill links registered successfully.',
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unable to register the Safaricom paybill links right now.',
    };
  }
}
