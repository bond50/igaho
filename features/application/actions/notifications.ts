"use server";

import { revalidatePath } from 'next/cache';

import { auth } from '@/auth';
import { db } from '@/lib/db';

function revalidateNotificationSurfaces() {
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/payments');
  revalidatePath('/dashboard/settings');
  revalidatePath('/profile');
  revalidatePath('/apply');
}

async function persistReadCursor(readAt: Date) {
  const session = await auth();

  if (!session?.user?.id) {
    return;
  }

  await db.userNotificationState.upsert({
    where: { userId: session.user.id },
    update: { lastReadAt: readAt },
    create: {
      userId: session.user.id,
      lastReadAt: readAt,
    },
  });

  revalidateNotificationSurfaces();
}

async function persistNotificationState(update: {
  lastReadAt?: Date;
  dismissIds?: string[];
}) {
  const session = await auth();

  if (!session?.user?.id) {
    return;
  }

  const existing = await db.userNotificationState.findUnique({
    where: { userId: session.user.id },
    select: {
      dismissedNotificationIds: true,
      lastReadAt: true,
    },
  });

  const mergedDismissIds = update.dismissIds
    ? [...new Set([...(existing?.dismissedNotificationIds ?? []), ...update.dismissIds])]
    : existing?.dismissedNotificationIds ?? [];

  await db.userNotificationState.upsert({
    where: { userId: session.user.id },
    update: {
      lastReadAt: update.lastReadAt ?? existing?.lastReadAt ?? null,
      dismissedNotificationIds: mergedDismissIds,
    },
    create: {
      userId: session.user.id,
      lastReadAt: update.lastReadAt ?? null,
      dismissedNotificationIds: mergedDismissIds,
    },
  });

  revalidateNotificationSurfaces();
}

export async function markHeaderNotificationsRead() {
  await persistReadCursor(new Date());
}

export async function markHeaderNotificationRead(createdAt: string | Date) {
  const readAt = createdAt instanceof Date ? createdAt : new Date(createdAt);
  await persistReadCursor(readAt);
}

export async function clearHeaderNotification(notificationId: string) {
  await persistNotificationState({ dismissIds: [notificationId] });
}

export async function clearHeaderNotifications(notificationIds: string[]) {
  await persistNotificationState({ dismissIds: notificationIds });
}
