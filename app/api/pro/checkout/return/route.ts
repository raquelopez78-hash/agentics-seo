import { upsertFromCheckout } from '@/lib/pro/accounts';
import { isProPlan } from '@/lib/pro/plans';
import { redirectTo, sessionCookie } from '@/lib/pro/session';
import { getCheckoutSession, stripeEnabled } from '@/lib/pro/stripe';
import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Vuelta de Stripe tras pagar: confirma el pago con Stripe, da de alta (por si el webhook tarda) e inicia sesión.
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('session_id') ?? '';
  if (!stripeEnabled() || !/^cs_[A-Za-z0-9_]{10,200}$/.test(id)) return redirectTo(`${SITE_URL}/pro`);
  try {
    const cs = await getCheckoutSession(id);
    const email = cs.customer_details?.email?.toLowerCase();
    if (cs.status === 'complete' && cs.mode === 'subscription' && email && cs.customer) {
      await upsertFromCheckout({ email, customerId: cs.customer, subscriptionId: cs.subscription, plan: isProPlan(cs.metadata?.plan) ? cs.metadata.plan : null });
      return redirectTo(`${SITE_URL}/pro?pago=ok`, process.env.SESSION_SECRET ? sessionCookie(email) : undefined);
    }
  } catch (error) {
    console.error('seo-audit checkout return', error);
  }
  return redirectTo(`${SITE_URL}/pro`);
}
