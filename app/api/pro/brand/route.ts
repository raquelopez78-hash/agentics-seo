import { isActivePro, setBrand } from '@/lib/pro/accounts';
import { isValidLogo } from '@/lib/pro/crypto';
import { sessionEmail } from '@/lib/pro/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

// POST { name, logo } → marca propia para el PDF (logo: data URL png/jpeg/webp, o null para quitarlo).
export async function POST(request: Request) {
  const email = await sessionEmail();
  if (!email || !(await isActivePro(email))) return json({ error: 'Necesitas el Plan Pro activo.' }, 401);
  const raw = await request.text();
  if (raw.length > 220_000) return json({ error: 'El logo es demasiado grande (máx. 150 KB).' }, 413);
  const body = JSON.parse(raw || '{}') as { name?: unknown; logo?: unknown };
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) || null : null;
  if (body.logo !== null && body.logo !== undefined && !isValidLogo(body.logo)) return json({ error: 'Formato de logo no válido (PNG, JPG o WebP).' }, 400);
  try {
    await setBrand(email, name, (body.logo as string | null | undefined) ?? null);
    return json({ ok: true });
  } catch (error) {
    console.error('seo-audit pro brand', (error as { code?: string })?.code ?? error);
    return json({ error: 'No se pudo guardar.' }, 500);
  }
}
