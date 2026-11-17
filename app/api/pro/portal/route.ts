import { getAccount } from '@/lib/pro/accounts';
import { sessionEmail } from '@/lib/pro/session';
import { createPortal, stripeEnabled } from '@/lib/pro/stripe';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

// POST → { url } del portal de cliente de Stripe (facturas, tarjeta, cancelar).
export async function POST() {
  const email = await sessionEmail();
  const account = email ? await getAccount(email) : null;
  if (!stripeEnabled() || !account?.stripeCustomerId) return json({ error: 'No hay una suscripción asociada a esta cuenta.' }, 404);
  try {
    return json({ url: await createPortal(account.stripeCustomerId) });
  } catch (error) {
    console.error('seo-audit portal', error);
    return json({ error: 'No se pudo abrir el portal de pago.' }, 502);
  }
}
