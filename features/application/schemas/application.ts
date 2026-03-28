import * as z from 'zod';

export const salutations = ['Mr', 'Ms', 'Mrs', 'Dr', 'Prof', 'Pst', 'Eng', 'Hon', 'Rev', 'Other'] as const;
export const genders = ['Male', 'Female'] as const;
export const ageBrackets = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'] as const;
export const nextOfKinRelationships = ['Parent', 'Sibling', 'Spouse', 'Child', 'Other'] as const;
export const yearsOfExperienceOptions = ['0-2', '3-5', '6-10', '10+'] as const;
export const educationLevels = ['Diploma', "Bachelor's Degree", "Master's Degree", 'PhD'] as const;
export const membershipTypes = ['NEW_APPLICATION', 'RENEWAL', 'UPGRADE'] as const;
export const paymentMethods = ['MPESA', 'BANK_TRANSFER', 'CARD'] as const;
export const paymentCollectionModes = ['MANUAL_PROOF', 'MPESA_DARAJA'] as const;

const requiredString = (label: string) => z.string().trim().min(1, `${label} is required`);
const optionalString = () => z.string().trim().optional();
const requiredChecked = (message: string) => z.boolean().refine((value) => value === true, message);

export const applicationSchema = z
  .object({
    membershipType: z.enum(membershipTypes),
    membershipCategoryId: requiredString('Membership category'),
    paymentCollectionMode: z.enum(paymentCollectionModes),
    paymentMethod: z.enum(paymentMethods),
    payerPhoneNumber: optionalString(),
    transactionReferenceNumber: optionalString(),
    declarationConfirmed: requiredChecked('You must confirm the declaration'),
    codeOfConductAccepted: requiredChecked('You must agree to the code of conduct'),
    dataProcessingConsent: requiredChecked('You must consent to data processing'),
    digitalSignature: requiredString('Digital signature'),
    declarationDate: z.coerce.date(),
  })
  .superRefine((data, ctx) => {
    if (data.paymentCollectionMode === 'MANUAL_PROOF' && !data.transactionReferenceNumber) {
      ctx.addIssue({
        code: 'custom',
        message: 'Transaction reference number is required for manual proof payments.',
        path: ['transactionReferenceNumber'],
      });
    }

    if (data.paymentCollectionMode === 'MPESA_DARAJA') {
      if (data.paymentMethod !== 'MPESA') {
        ctx.addIssue({
          code: 'custom',
          message: 'Daraja payments must use M-Pesa.',
          path: ['paymentMethod'],
        });
      }

      if (!data.payerPhoneNumber) {
        ctx.addIssue({
          code: 'custom',
          message: 'Enter the Safaricom number that should receive the STK push.',
          path: ['payerPhoneNumber'],
        });
      }
    }
  });

export type ApplicationValues = z.infer<typeof applicationSchema>;
