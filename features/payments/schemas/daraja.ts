import * as z from 'zod';

export const paymentPurposeSchema = z.enum(['APPLICATION_FEE', 'ANNUAL_RENEWAL']);

export const adminPaymentRequestSchema = z.object({
  applicationId: z.string().trim().min(1, 'Select an applicant or member'),
  purpose: paymentPurposeSchema,
  phoneNumber: z.string().trim().min(1, 'Phone number is required'),
  amount: z.coerce.number().int().positive('Amount must be greater than zero'),
  billingYear: z.coerce.number().int().min(2024).max(2100).optional(),
});

export const applicantMpesaStkSchema = z.object({
  phoneNumber: z.string().trim().min(1, 'Phone number is required'),
});

export const adminManualPaymentRecordSchema = z.object({
  applicationId: z.string().trim().min(1, 'Select an applicant or member'),
  purpose: paymentPurposeSchema,
  billingYear: z.coerce.number().int().min(2024).max(2100).optional(),
  paymentMethod: z.enum(['MPESA', 'BANK_TRANSFER', 'CARD']),
  status: z.enum(['VERIFIED', 'PENDING', 'REJECTED']).default('VERIFIED'),
  transactionReferenceNumber: z.string().trim().min(1, 'Transaction reference number is required'),
  paidAt: z.coerce.date(),
  amount: z.coerce.number().int().min(1, 'Amount must be at least KES 1'),
  payerPhoneNumber: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export type PaymentPurposeValue = z.infer<typeof paymentPurposeSchema>;
export type AdminPaymentRequestValues = z.infer<typeof adminPaymentRequestSchema>;
export type ApplicantMpesaStkValues = z.infer<typeof applicantMpesaStkSchema>;
export type AdminManualPaymentRecordValues = z.infer<typeof adminManualPaymentRecordSchema>;
