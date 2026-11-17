import { pg } from '@/db/pg';
import { hashToken } from '@/lib/pro/crypto';
import { redirectTo, sessionCookie } from '@/lib/pro/session';
import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET ?token=... (enlace del email) → abre sesión y redirige a /pro.
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') ?? '';
  let email: string | null = null;
  if (/^[A-Za-z0-9_-]{40,60}$/.test(token) && process.env.DATABASE_URL) {
    try {
      const [row] = await pg()<{ email: string }[]>`update seo_audit.login_tokens set used_at = now()
        where token_hash = ${hashToken(token)} and used_at is null and expires_at > now() returning email`;
      email = row?.email ?? null;
    } catch (error) {
      console.error('seo-audit pro verify', (error as { code?: string })?.code ?? error);
    }
  }
  if (!email) return redirectTo(`${SITE_URL}/pro?acceso=caducado`);
  return redirectTo(`${SITE_URL}/pro`, sessionCookie(email));
}
