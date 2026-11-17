import { isProPlan } from '@/lib/pro/plans';
import { sessionEmail } from '@/lib/pro/session';
import { createCheckout, stripeEnabled } from '@/lib/pro/stripe';
import { clientIp, rateLimited } from '@/lib/seo-audit/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

// POST { plan: 'monthly' | 'yearly' } → { url } de Stripe Checkout.
export async function POST(request: Request) {
  if (!stripeEnabled()) return json({ error: 'El pago online aún no está activo. Escríbenos y te damos acceso.' }, 503);
  if (rateLimited(`checkout:${clientIp(request)}`, 20, 60 * 60_000)) return json({ error: 'Demasiados intentos. Inténtalo más tarde.' }, 429);
  const body = (await request.json().catch(() => ({}))) as { plan?: unknown };
  if (!isProPlan(body.plan)) return json({ error: 'Plan no válido.' }, 400);
  try {
    return json({ url: await createCheckout(body.plan, await sessionEmail()) });
  } catch (error) {
    console.error('seo-audit checkout', error);
    return json({ error: 'No se pudo iniciar el pago. Inténtalo de nuevo.' }, 502);
  }
}
