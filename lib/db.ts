import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/prisma/src/generated/prisma/client';

const PRISMA_SCHEMA_CACHE_VERSION = '2026-03-28-renewal-cycle-v1';

const prismaClientSingleton = () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
};

function isCompatiblePrismaClient(value: unknown): value is ReturnType<typeof prismaClientSingleton> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'user' in value &&
    'membershipApplication' in value &&
    'applicationDraft' in value &&
    'applicantProfile' in value &&
    'membershipCategory' in value &&
    'applicationPortalSetting' in value &&
    'applicationPaymentProofHistory' in value &&
    'membershipPaymentRecord' in value &&
    'paymentIntent' in value &&
    'mpesaStkRequest' in value &&
    'mpesaC2BReceipt' in value &&
    'paymentIncident' in value &&
    'userNotificationState' in value
  );
}

declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton> | undefined;
  prismaGlobalVersion: string | undefined;
} & typeof global;

const cachedClient =
  globalThis.prismaGlobalVersion === PRISMA_SCHEMA_CACHE_VERSION && isCompatiblePrismaClient(globalThis.prismaGlobal)
    ? globalThis.prismaGlobal
    : undefined;

export const db = cachedClient ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') {
  globalThis.prismaGlobal = db;
  globalThis.prismaGlobalVersion = PRISMA_SCHEMA_CACHE_VERSION;
}

