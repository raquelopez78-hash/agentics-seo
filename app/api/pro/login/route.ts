import { pg } from '@/db/pg';
import { isActivePro } from '@/lib/pro/accounts';
import { newLoginToken } from '@/lib/pro/crypto';
import { mailerEnabled, sendLoginLink } from '@/lib/pro/mailer';
import { clientIp, rateLimited } from '@/lib/seo-audit/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const SENT = 'Si ese email tiene el Plan Pro activo, recibirás un enlace de acceso en unos segundos (revisa también spam).';

// POST { email } → envía un enlace de acceso de un solo uso si el email es Pro. Respuesta idéntica en ambos casos.
export async function POST(request: Request) {
  if (rateLimited(`login:${clientIp(request)}`, 8, 60 * 60_000)) return json({ error: 'Demasiados intentos. Inténtalo más tarde.' }, 429);
  if (!mailerEnabled() || !process.env.DATABASE_URL || !process.env.SESSION_SECRET) return json({ error: 'El acceso Pro aún no está activo.' }, 503);
  const body = (await request.json().catch(() => ({}))) as { email?: unknown };
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json({ error: 'Email no válido.' }, 400);
  if (rateLimited(`login-mail:${email}`, 4, 60 * 60_000)) return json({ ok: true, message: SENT });
  try {
    if (await isActivePro(email)) {
      const { token, hash } = newLoginToken();
      await pg()`insert into seo_audit.login_tokens (token_hash, email, expires_at) values (${hash}, ${email}, now() + interval '20 minutes')`;
      await sendLoginLink(email, token);
    }
  } catch (error) {
    console.error('seo-audit pro login', (error as { code?: string })?.code ?? error);
    return json({ error: 'No se pudo enviar el enlace. Inténtalo de nuevo en unos minutos.' }, 502);
  }
  return json({ ok: true, message: SENT });
}
