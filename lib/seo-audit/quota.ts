// Plan gratuito: hasta N informes completos por email (por defecto 2). Las cuentas Pro no tienen límite.
import { pg } from '@/db/pg';

export const FREE_AUDITS = Math.max(1, Number(process.env.FREE_AUDITS_PER_EMAIL || 2));

/** Emails con acceso Pro (provisional, hasta tener el plan de pago): SEO_PRO_EMAILS=a@b.com,c@d.com */
export function isPro(email: string) {
  return (process.env.SEO_PRO_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
}

export type QuotaResult = { allowed: boolean; alreadyUnlocked: boolean; used: number; limit: number };

/** ¿Puede este email desbloquear este informe? Volver a abrir un informe ya desbloqueado no consume cupo. */
export async function checkFreeQuota(email: string, shareUrl: string | null, auditedUrl: string): Promise<QuotaResult> {
  const limit = FREE_AUDITS;
  if (!process.env.DATABASE_URL || isPro(email)) return { allowed: true, alreadyUnlocked: false, used: 0, limit };
  try {
    const key = shareUrl || auditedUrl;
    const [row] = await pg()<{ used: number; has: boolean }[]>`
      select count(distinct coalesce(nullif(report_url, ''), audited_url))::int as used,
             coalesce(bool_or(coalesce(nullif(report_url, ''), audited_url) = ${key}), false) as has
      from seo_audit.leads where lower(email) = lower(${email})`;
    if (row.has) return { allowed: true, alreadyUnlocked: true, used: row.used, limit };
    return { allowed: row.used < limit, alreadyUnlocked: false, used: row.used, limit };
  } catch (error) {
    // Si la comprobación falla, no se bloquea al usuario.
    console.error('seo-audit quota', (error as { code?: string })?.code ?? error);
    return { allowed: true, alreadyUnlocked: false, used: 0, limit };
  }
}
