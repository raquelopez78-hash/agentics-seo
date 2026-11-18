import { getAccount, isActive, listHistory } from '@/lib/pro/accounts';
import { sessionEmail } from '@/lib/pro/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

// GET → cuenta Pro de la sesión (?history=1 incluye el historial).
export async function GET(request: Request) {
  const email = await sessionEmail();
  if (!email) return json({ pro: false }, 401);
  const account = await getAccount(email);
  const active = isActive(email, account);
  const withHistory = new URL(request.url).searchParams.has('history');
  return json({
    pro: active,
    email,
    status: account?.status ?? (active ? 'manual' : 'inactive'),
    plan: account?.plan ?? null,
    currentPeriodEnd: account?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: account?.cancelAtPeriodEnd ?? false,
    canManageBilling: !!account?.stripeCustomerId,
    brand: { name: account?.brandName ?? null, logo: account?.brandLogo ?? null, contact: account?.brandContact ?? null },
    history: withHistory && active ? await listHistory(email) : undefined,
  });
}
