import { auth } from '@/auth';
import { getHeaderNotifications } from '@/features/application/queries/application';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const encoder = new TextEncoder();
const NOTIFICATION_PUSH_INTERVAL_MS = 1500;

function serializeEvent(data: unknown) {
  return encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
}

function serializeComment(comment: string) {
  return encoder.encode(`: ${comment}\n\n`);
}

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const userId = session.user.id;
  const isAdmin = session.user.role === 'ADMIN';

  let interval: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const pushNotifications = async () => {
        try {
          const notifications = await getHeaderNotifications(isAdmin, userId);
          controller.enqueue(serializeEvent(notifications));
        } catch {
          controller.enqueue(serializeComment('notification-refresh-failed'));
        }
      };

      await pushNotifications();
      interval = setInterval(() => {
        void pushNotifications();
      }, NOTIFICATION_PUSH_INTERVAL_MS);
    },
    cancel() {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
