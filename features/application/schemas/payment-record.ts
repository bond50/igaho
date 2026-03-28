import * as z from 'zod';

export const memberPaymentStatuses = ['VERIFIED', 'PENDING', 'REJECTED'] as const;
export const manualPaymentRecordSchema = z.object({
  paymentMethod: z.enum(['MPESA', 'BANK_TRANSFER', 'CARD']),
  status: z.enum(memberPaymentStatuses),
  transactionReferenceNumber: z.string().trim().min(1, 'Transaction reference number is required'),
  paidAt: z.coerce.date(),
  amount: z.coerce.number().int().min(1, 'Amount must be at least KES 1'),
  payerPhoneNumber: z.string().trim().optional(),
  description: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export type ManualPaymentRecordValues = z.infer<typeof manualPaymentRecordSchema>;
