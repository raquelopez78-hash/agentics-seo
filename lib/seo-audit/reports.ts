// Informes guardados en servidor. El cliente nunca envía el informe que se publica: se guarda al auditar
// y solo se actualiza desde el servidor (Core Web Vitals), así nadie puede publicar notas falsas en el dominio.
import { randomBytes } from 'node:crypto';
import { pg } from '@/db/pg';
import { SITE_URL } from '@/lib/site';
import { finalizeReport, type AuditCheck, type AuditReport } from './scoring';

const enabled = () => !!process.env.DATABASE_URL;
export const isValidReportId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{10,16}$/.test(id);
export const reportUrl = (id: string) => `${SITE_URL}/r/${id}`;

/** owner: email Pro (historial); el informe de un Pro se guarda ya desbloqueado. */
export async function saveReport(report: AuditReport, owner: string | null = null): Promise<string | undefined> {
  if (!enabled()) return undefined;
  const id = randomBytes(8).toString('base64url');
  try {
    const sql = pg();
    await sql`insert into seo_audit.reports (id, host, final_url, score, report, owner_email, unlocked)
      values (${id}, ${new URL(report.finalUrl).hostname}, ${report.finalUrl}, ${report.score}, ${sql.json({ ...report, id } as never)}, ${owner}, ${!!owner})`;
    return id;
  } catch (error) {
    console.error('seo-audit reports', (error as { code?: string })?.code ?? error);
    return undefined;
  }
}

export async function loadReport(id: string, opts: { unlockedOnly: boolean }): Promise<AuditReport | null> {
  if (!enabled() || !isValidReportId(id)) return null;
  try {
    const rows = await pg()<{ report: AuditReport; unlocked: boolean }[]>`select report, unlocked from seo_audit.reports where id = ${id}`;
    const row = rows[0];
    if (!row || (opts.unlockedOnly && !row.unlocked)) return null;
    return row.report;
  } catch (error) {
    console.error('seo-audit reports', (error as { code?: string })?.code ?? error);
    return null;
  }
}

/** Sustituye los checks pendientes de rendimiento por los de PageSpeed y recalcula la nota. */
export async function mergePerformance(id: string, checks: AuditCheck[]) {
  const current = await loadReport(id, { unlockedOnly: false });
  if (!current) return;
  const categories = current.categories.map((c) => (c.id === 'performance' ? { ...c, checks: [...c.checks.filter((k) => k.status !== 'pending'), ...checks] } : c));
  const updated = finalizeReport({ ...current, categories });
  try {
    const sql = pg();
    await sql`update seo_audit.reports set report = ${sql.json(updated as never)}, score = ${updated.score} where id = ${id}`;
  } catch (error) {
    console.error('seo-audit reports', (error as { code?: string })?.code ?? error);
  }
}

export async function unlockReport(id: string) {
  if (!enabled() || !isValidReportId(id)) return;
  try {
    await pg()`update seo_audit.reports set unlocked = true where id = ${id}`;
  } catch (error) {
    console.error('seo-audit reports', (error as { code?: string })?.code ?? error);
  }
}
