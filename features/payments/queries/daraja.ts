import { Prisma } from '@/prisma/src/generated/prisma/client';
import { getDarajaConfigStatus } from '@/features/payments/lib/daraja';
import { db } from '@/lib/db';

export function getDarajaStatus(options?: { shortCode?: string | null; transactionType?: 'CustomerPayBillOnline' | 'CustomerBuyGoodsOnline' }) {
  return getDarajaConfigStatus(options);
}

export async function getRecentMpesaStkRequests(limit = 10) {
  return db.mpesaStkRequest.findMany({
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: {
      application: {
        select: {
          id: true,
          firstName: true,
          surname: true,
          email: true,
          membershipNumber: true,
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      paymentIntent: {
        select: {
          id: true,
          purpose: true,
          billingYear: true,
        },
      },
    },
  });
}

export async function getLatestApplicantMpesaRequest(userId: string) {
  return db.mpesaStkRequest.findFirst({
    where: { userId },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function getMemberActiveRenewalIntent(userId: string, billingYear = new Date().getFullYear()) {
  return db.paymentIntent.findFirst({
    where: {
      userId,
      purpose: 'ANNUAL_RENEWAL',
      billingYear,
      membershipApplicationId: { not: null },
      status: {
        in: ['CREATED', 'AWAITING_PAYMENT', 'VERIFIED', 'FAILED', 'CANCELLED', 'EXPIRED', 'LOCKED'],
      },
    },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    include: {
      requests: {
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        take: 1,
      },
    },
  });
}

export async function getLatestMemberRenewalRequest(userId: string, billingYear = new Date().getFullYear()) {
  return db.mpesaStkRequest.findFirst({
    where: {
      userId,
      paymentIntent: {
        purpose: 'ANNUAL_RENEWAL',
        billingYear,
      },
    },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function getApplicantActivePaymentIntent(userId: string) {
  return db.paymentIntent.findFirst({
    where: {
      userId,
      purpose: 'APPLICATION_FEE',
      applicationId: null,
      status: {
        in: ['CREATED', 'AWAITING_PAYMENT', 'VERIFIED', 'FAILED', 'CANCELLED'],
      },
    },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    include: {
      requests: {
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        take: 1,
      },
    },
  });
}

export async function getVerifiedApplicantPaymentIntent(userId: string, totalAmount: number) {
  return db.paymentIntent.findFirst({
    where: {
      userId,
      purpose: 'APPLICATION_FEE',
      applicationId: null,
      totalAmount,
      status: 'VERIFIED',
      lockedAt: null,
    },
    orderBy: [{ verifiedAt: 'desc' }, { updatedAt: 'desc' }],
    include: {
      requests: {
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      },
    },
  });
}

export async function getStaleMpesaRequests(limit = 25) {
  return db.mpesaStkRequest.findMany({
    where: {
      status: {
        in: ['INITIATED', 'AWAITING_CALLBACK', 'CALLBACK_RECEIVED'],
      },
      OR: [
        { nextReconciliationAt: { lte: new Date() } },
        { nextReconciliationAt: null, createdAt: { lte: new Date(Date.now() - 60_000) } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
}


export async function getAdminPaymentExceptions() {
  const staleCutoff = new Date(Date.now() - 5 * 60_000);

  const [awaitingCallback, callbackMissingButPossiblyPaid, failedOrClosedIntents, verifiedUnlockedIntents, unmatchedC2BReceipts, openIncidents] = await Promise.all([
    db.mpesaStkRequest.findMany({
      where: {
        status: {
          in: ['INITIATED', 'AWAITING_CALLBACK', 'CALLBACK_RECEIVED'],
        },
        OR: [
          { nextReconciliationAt: { lte: new Date() } },
          { createdAt: { lte: staleCutoff } },
        ],
      },
      orderBy: [{ createdAt: 'asc' }],
      take: 25,
      include: {
        application: {
          select: {
            id: true,
            firstName: true,
            surname: true,
            email: true,
            membershipNumber: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        paymentIntent: {
          select: {
            id: true,
            status: true,
            verifiedAt: true,
            lockedAt: true,
          },
        },
      },
    }),
    db.mpesaStkRequest.findMany({
      where: {
        callbackPayload: { equals: Prisma.JsonNull },
        status: {
          in: ['SUCCESS', 'VERIFIED'],
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 25,
      include: {
        application: {
          select: {
            id: true,
            firstName: true,
            surname: true,
            email: true,
            membershipNumber: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        paymentIntent: {
          select: {
            id: true,
            status: true,
            verifiedAt: true,
            lockedAt: true,
          },
        },
      },
    }),
    db.paymentIntent.findMany({
      where: {
        status: {
          in: ['FAILED', 'CANCELLED', 'EXPIRED'],
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 25,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        application: {
          select: {
            id: true,
            firstName: true,
            surname: true,
            email: true,
            membershipNumber: true,
          },
        },
        requests: {
          orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
          take: 1,
        },
      },
    }),
    db.paymentIntent.findMany({
      where: {
        purpose: 'APPLICATION_FEE',
        status: 'VERIFIED',
        applicationId: null,
        lockedAt: null,
      },
      orderBy: [{ verifiedAt: 'desc' }, { updatedAt: 'desc' }],
      take: 25,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        requests: {
          orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
          take: 1,
        },
      },
    }),
    db.mpesaC2BReceipt.findMany({
      where: {
        applicationId: null,
      },
      orderBy: [{ transTime: 'desc' }, { createdAt: 'desc' }],
      take: 25,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    }),
    db.paymentIncident.findMany({
      where: { status: 'OPEN' },
      orderBy: [{ detectedAt: 'desc' }],
      take: 25,
      include: {
        application: {
          select: { id: true, firstName: true, surname: true, email: true },
        },
        paymentIntent: {
          select: { id: true, status: true, accountReference: true, totalAmount: true, currency: true },
        },
        mpesaRequest: {
          select: { id: true, checkoutRequestId: true, mpesaReceiptNumber: true, status: true },
        },
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    }),
  ]);

  return {
    awaitingCallback,
    callbackMissingButPossiblyPaid,
    failedOrClosedIntents,
    verifiedUnlockedIntents,
    unmatchedC2BReceipts,
    openIncidents,
    counts: {
      awaitingCallback: awaitingCallback.length,
      callbackMissingButPossiblyPaid: callbackMissingButPossiblyPaid.length,
      failedOrClosedIntents: failedOrClosedIntents.length,
      verifiedUnlockedIntents: verifiedUnlockedIntents.length,
      unmatchedC2BReceipts: unmatchedC2BReceipts.length,
      openIncidents: openIncidents.length,
    },
  };
}

export async function getPendingRenewalAccessApprovals(limit = 25) {
  return db.paymentIntent.findMany({
    where: {
      purpose: 'ANNUAL_RENEWAL',
      status: 'VERIFIED',
      lockedAt: null,
      membershipApplicationId: { not: null },
    },
    orderBy: [{ verifiedAt: 'desc' }, { updatedAt: 'desc' }],
    take: limit,
    include: {
      membershipApplication: {
        select: {
          id: true,
          firstName: true,
          surname: true,
          email: true,
          membershipNumber: true,
          county: true,
        },
      },
      requests: {
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        take: 1,
      },
    },
  });
}
