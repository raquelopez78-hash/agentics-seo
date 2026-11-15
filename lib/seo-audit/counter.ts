// Contador público de auditorías. Requiere DATABASE_URL; sin base de datos, no hace nada y el contador no se muestra.
import { pg } from '@/db/pg';

export async function recordAudit(host: string, score: number) {
  if (!process.env.DATABASE_URL) return;
  try {
    await pg()`insert into seo_audit.audits (host, score) values (${host.slice(0, 253)}, ${score})`;
    cache = null;
  } catch (error) {
    console.error('seo-audit counter', (error as { code?: string })?.code ?? (error instanceof Error ? error.message : error));
  }
}

let cache: { at: number; value: { total: number; today: number } } | null = null;

/** Totales con caché de 60 s. "Hoy" se calcula en hora de Madrid. */
export async function auditCounts(): Promise<{ total: number; today: number } | null> {
  if (!process.env.DATABASE_URL) return null;
  if (cache && Date.now() - cache.at < 60_000) return cache.value;
  try {
    const [row] = await pg()<{ total: number; today: number }[]>`
      select count(*)::int as total,
             count(*) filter (where created_at >= (date_trunc('day', now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid'))::int as today
      from seo_audit.audits`;
    cache = { at: Date.now(), value: { total: row.total, today: row.today } };
    return cache.value;
  } catch (error) {
    console.error('seo-audit counter', (error as { code?: string })?.code ?? (error instanceof Error ? error.message : error));
    return null;
  }
}
