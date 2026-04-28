import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  await dbReady;

  const { searchParams } = new URL(request.url);
  const lastId = parseInt(searchParams.get('lastId') ?? '0', 10);

  const encoder = new TextEncoder();
  let closed = false;
  let lastSeenId = isNaN(lastId) ? 0 : lastId;

  const stream = new ReadableStream({
    start(controller) {
      // Confirm connection
      controller.enqueue(encoder.encode('event: connected\ndata: {}\n\n'));

      const poll = async () => {
        if (closed) return;
        try {
          const result = await db.execute({
            sql: `SELECT cm.id, cm.conversation_id, cm.sender_id, cm.content, cm.created_at,
                         u.email AS sender_email, COALESCE(u.display_name, u.email) AS sender_name
                  FROM chat_messages cm
                  JOIN users u ON cm.sender_id = u.id
                  JOIN chat_conversations cc ON cm.conversation_id = cc.id
                  WHERE (cc.user1_id = ? OR cc.user2_id = ?)
                    AND cm.id > ?
                  ORDER BY cm.id ASC
                  LIMIT 50`,
            args: [user.id, user.id, lastSeenId],
          });

          for (const row of result.rows) {
            const id = Number(row.id);
            if (id > lastSeenId) lastSeenId = id;
            const msg = {
              id,
              conversation_id: Number(row.conversation_id),
              sender_id: Number(row.sender_id),
              content: String(row.content),
              created_at: String(row.created_at),
              sender_email: String(row.sender_email),
              sender_name: String(row.sender_name),
            };
            controller.enqueue(encoder.encode(`event: message\ndata: ${JSON.stringify(msg)}\n\n`));
          }
        } catch {
          // DB errors are transient — keep polling
        }

        if (!closed) setTimeout(poll, 1500);
      };

      // First poll after a short delay to let the client set up listeners
      setTimeout(poll, 500);

      // Keepalive every 25 seconds to prevent proxy timeouts
      const keepalive = setInterval(() => {
        if (closed) {
          clearInterval(keepalive);
          return;
        }
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        } catch {
          clearInterval(keepalive);
          closed = true;
        }
      }, 25000);
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    },
  });
}
