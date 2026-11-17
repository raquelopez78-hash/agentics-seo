// Stripe vía API REST (sin SDK). Requiere STRIPE_SECRET_KEY (sk_test_... para pruebas, sk_live_... en real).
import { SITE_URL } from '@/lib/site';
import { PRO_PRICES, type ProPlan } from './plans';

export const stripeEnabled = () => !!process.env.STRIPE_SECRET_KEY;

function encode(params: Record<string, string | number | undefined>) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) body.append(k, String(v));
  return body;
}

async function stripePost<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: encode(params),
  });
  const data = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${data.error?.message ?? 'error'}`);
  return data;
}

async function stripeGet<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, { signal: AbortSignal.timeout(10_000), headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` } });
  const data = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${data.error?.message ?? 'error'}`);
  return data;
}

export type CheckoutSession = { status: string; mode: string; customer: string | null; subscription: string | null; customer_details?: { email?: string | null }; metadata?: Record<string, string> };
export const getCheckoutSession = (id: string) => stripeGet<CheckoutSession>(`checkout/sessions/${encodeURIComponent(id)}`);

/** Sesión de Stripe Checkout para la suscripción (precio definido aquí, sin crear productos en el panel). */
export async function createCheckout(plan: ProPlan, email: string | null) {
  const interval = plan === 'monthly' ? 'month' : 'year';
  const session = await stripePost<{ url: string }>('checkout/sessions', {
    mode: 'subscription',
    'line_items[0][quantity]': 1,
    'line_items[0][price_data][currency]': 'eur',
    'line_items[0][price_data][unit_amount]': Math.round(PRO_PRICES[plan] * 100),
    'line_items[0][price_data][recurring][interval]': interval,
    'line_items[0][price_data][product_data][name]': `Auditor SEO con IA · Plan Pro ${plan === 'monthly' ? 'mensual' : 'anual'}`,
    'metadata[plan]': plan,
    'subscription_data[metadata][plan]': plan,
    customer_email: email ?? undefined,
    allow_promotion_codes: 'true',
    billing_address_collection: 'required',
    'tax_id_collection[enabled]': 'true',
    locale: 'es',
    success_url: `${SITE_URL}/api/pro/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE_URL}/pro`,
  });
  return session.url;
}

/** Portal de cliente de Stripe: factura, método de pago y cancelación. */
export async function createPortal(customerId: string) {
  const session = await stripePost<{ url: string }>('billing_portal/sessions', { customer: customerId, return_url: `${SITE_URL}/pro` });
  return session.url;
}
