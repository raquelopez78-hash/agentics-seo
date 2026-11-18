import { updateSubscription, upsertFromCheckout } from '@/lib/pro/accounts';
import { verifyStripeSignature } from '@/lib/pro/crypto';
import { isProPlan } from '@/lib/pro/plans';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Obj = Record<string, unknown> & { metadata?: Record<string, string> };
const str = (v: unknown) => (typeof v === 'string' ? v : null);
const planOf = (o: Obj) => (isProPlan(o.metadata?.plan) ? o.metadata.plan : null);

// Eventos de Stripe (configurar en Stripe → Developers → Webhooks, con STRIPE_WEBHOOK_SECRET):
// checkout.session.completed, customer.subscription.updated, customer.subscription.deleted
export async function POST(request: Request) {
  const payload = await request.text();
  if (!verifyStripeSignature(payload, request.headers.get('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET || '')) {
    return new Response('firma no válida', { status: 400 });
  }
  const event = JSON.parse(payload) as { type: string; data: { object: Obj } };
  const o = event.data.object;
  try {
    if (event.type === 'checkout.session.completed' && o.mode === 'subscription') {
      const details = o.customer_details as { email?: string } | undefined;
      const email = str(details?.email) ?? str(o.customer_email);
      const customerId = str(o.customer);
      if (email && customerId) await upsertFromCheckout({ email, customerId, subscriptionId: str(o.subscription), plan: planOf(o) });
    } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted' || event.type === 'customer.subscription.created') {
      const items = (o.items as { data?: { current_period_end?: number }[] } | undefined)?.data ?? [];
      // current_period_end está en la suscripción (API antigua) o en sus líneas (API reciente).
      const periodEnd = typeof o.current_period_end === 'number' ? o.current_period_end : items[0]?.current_period_end ?? null;
      const customerId = str(o.customer);
      const subscriptionId = str(o.id);
      if (customerId && subscriptionId) {
        await updateSubscription({ customerId, subscriptionId, status: event.type === 'customer.subscription.deleted' ? 'canceled' : String(o.status), plan: planOf(o), periodEnd, cancelAtPeriodEnd: o.cancel_at_period_end === true || typeof o.cancel_at === 'number' });
      }
    }
  } catch (error) {
    console.error('seo-audit stripe webhook', event.type, error);
    return new Response('error', { status: 500 }); // Stripe reintenta
  }
  return Response.json({ received: true });
}
