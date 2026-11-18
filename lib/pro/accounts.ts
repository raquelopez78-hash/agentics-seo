// Cuentas Pro en Postgres (seo_audit.pro_accounts) e historial de informes.
import { pg } from '@/db/pg';
import { isPro as isEnvPro } from '@/lib/seo-audit/quota';
import { PRO_ACTIVE_STATUSES } from './crypto';

export type ProAccount = {
  email: string; status: string; plan: string | null; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null; brandName: string | null; brandLogo: string | null; brandContact: string | null;
};

const log = (error: unknown) => console.error('seo-audit pro', (error as { code?: string })?.code ?? error);

export async function getAccount(email: string): Promise<ProAccount | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const [row] = await pg()<ProAccount[]>`select email, status, plan, current_period_end::text as "currentPeriodEnd", cancel_at_period_end as "cancelAtPeriodEnd",
      stripe_customer_id as "stripeCustomerId", brand_name as "brandName", brand_logo as "brandLogo", brand_contact as "brandContact"
      from seo_audit.pro_accounts where email = ${email.toLowerCase()}`;
    return row ?? null;
  } catch (error) { log(error); return null; }
}

/** Pro de pago con suscripción vigente, o email con acceso manual (SEO_PRO_EMAILS). */
export function isActive(email: string, account: ProAccount | null) {
  return isEnvPro(email) || (!!account && PRO_ACTIVE_STATUSES.includes(account.status));
}

export async function isActivePro(email: string) {
  return isActive(email, await getAccount(email));
}

/** Alta o actualización desde Stripe (checkout completado). */
export async function upsertFromCheckout(a: { email: string; customerId: string; subscriptionId: string | null; plan: string | null }) {
  await pg()`insert into seo_audit.pro_accounts (email, stripe_customer_id, stripe_subscription_id, status, plan)
    values (${a.email.toLowerCase()}, ${a.customerId}, ${a.subscriptionId}, 'active', ${a.plan})
    on conflict (email) do update set stripe_customer_id = excluded.stripe_customer_id,
      stripe_subscription_id = coalesce(excluded.stripe_subscription_id, seo_audit.pro_accounts.stripe_subscription_id),
      status = 'active', plan = coalesce(excluded.plan, seo_audit.pro_accounts.plan), updated_at = now()`;
}

/** Cambio de estado de la suscripción (renovación, impago, cancelación). */
export async function updateSubscription(s: { customerId: string; subscriptionId: string; status: string; plan: string | null; periodEnd: number | null; cancelAtPeriodEnd: boolean }) {
  await pg()`update seo_audit.pro_accounts set stripe_subscription_id = ${s.subscriptionId}, status = ${s.status},
    plan = coalesce(${s.plan}, plan), current_period_end = ${s.periodEnd ? new Date(s.periodEnd * 1000) : null}, cancel_at_period_end = ${s.cancelAtPeriodEnd}, updated_at = now()
    where stripe_customer_id = ${s.customerId}`;
}

export async function setBrand(email: string, brandName: string | null, brandLogo: string | null, brandContact: string | null) {
  // Los emails con acceso manual pueden no tener fila: se crea una sin suscripción.
  await pg()`insert into seo_audit.pro_accounts (email, brand_name, brand_logo, brand_contact) values (${email.toLowerCase()}, ${brandName}, ${brandLogo}, ${brandContact})
    on conflict (email) do update set brand_name = excluded.brand_name, brand_logo = excluded.brand_logo, brand_contact = excluded.brand_contact, updated_at = now()`;
}

export type HistoryItem = { id: string; host: string; finalUrl: string; score: number; createdAt: string };
export async function listHistory(email: string, limit = 100): Promise<HistoryItem[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    return await pg()<HistoryItem[]>`select id, host, final_url as "finalUrl", score::float as score, created_at::text as "createdAt"
      from seo_audit.reports where owner_email = ${email.toLowerCase()} order by created_at desc limit ${limit}`;
  } catch (error) { log(error); return []; }
}
