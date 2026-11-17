import { clearSessionCookie } from '@/lib/pro/session';

export const dynamic = 'force-dynamic';

export function POST() {
  return Response.json({ ok: true }, { headers: { 'set-cookie': clearSessionCookie(), 'cache-control': 'no-store' } });
}
