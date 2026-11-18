// Envío de correos a leads: informe al momento, aviso interno, seguimiento y reseña (tarea diaria).
import { pg } from '@/db/pg';
import { mailerEnabled, notifyEmail, sendMail } from '@/lib/mail';
import { unsubscribeToken } from '@/lib/pro/crypto';
import { REVIEW_URL, SITE_URL } from '@/lib/site';
import { followupMail, newLeadNotice, reportMail, reviewMail, type LeadMailData } from './emails';

const log = (what: string, error: unknown) => console.error(`seo-audit mails ${what}`, (error as { code?: string; message?: string })?.code ?? (error as Error)?.message ?? error);
const unsubscribeUrl = (id: string) => (process.env.SESSION_SECRET ? `${SITE_URL}/api/unsubscribe?id=${encodeURIComponent(id)}&t=${unsubscribeToken(id, process.env.SESSION_SECRET)}` : undefined);

/** Al registrar un lead: informe al lead y aviso interno. Nunca lanza. */
export async function sendLeadMails(id: string, d: LeadMailData) {
  if (!mailerEnabled()) return;
  const data = { ...d, unsubscribeUrl: unsubscribeUrl(id) };
  const jobs = [sendMail({ ...reportMail(data), replyTo: process.env.SMTP_USER, fromName: 'Raquel · Agentics Projects' })];
  const to = notifyEmail();
  if (to) jobs.push(sendMail(newLeadNotice(data, to)));
  const results = await Promise.allSettled(jobs);
  results.forEach((r, i) => { if (r.status === 'rejected') log(i === 0 ? 'informe' : 'aviso', r.reason); });
}

type Row = { id: string; name: string; email: string; audited_url: string; score: number | null; warnings: number; top_issues: unknown; report_url: string };
const toData = (r: Row): LeadMailData => ({
  name: r.name, email: r.email, auditedUrl: r.audited_url, score: r.score === null ? null : Number(r.score), warnings: r.warnings,
  topIssues: Array.isArray(r.top_issues) ? (r.top_issues as LeadMailData['topIssues']) : [], reportUrl: r.report_url, unsubscribeUrl: unsubscribeUrl(r.id),
});

/** Tarea diaria: seguimientos (2-14 días) y peticiones de reseña. Cada lead se reclama antes de enviar; si falla, se libera. */
export async function runScheduledMails(limit = 20) {
  const out = { followups: 0, reviews: 0, failed: 0 };
  if (!mailerEnabled() || !process.env.DATABASE_URL) return out;
  const sql = pg();
  const followups = await sql<Row[]>`update seo_audit.leads l set followup_sent_at = now()
    where l.id in (select id from seo_audit.leads
      where followup_sent_at is null and unsubscribed_at is null
        and created_at < now() - interval '2 days' and created_at > now() - interval '14 days'
      order by created_at limit ${limit} for update skip locked)
    returning l.id, l.name, l.email, l.audited_url, l.score::float as score, l.warnings, l.top_issues, l.report_url`;
  for (const r of followups) {
    try {
      await sendMail({ ...followupMail(toData(r)), replyTo: process.env.SMTP_USER, fromName: 'Raquel · Agentics Projects' });
      out.followups++;
    } catch (error) {
      out.failed++; log('seguimiento', error);
      await sql`update seo_audit.leads set followup_sent_at = null where id = ${r.id}`;
    }
  }
  if (!REVIEW_URL) return out;
  const reviews = await sql<Row[]>`update seo_audit.leads l set review_requested_at = now()
    where l.id in (select id from seo_audit.leads
      where review_requested_at is null and unsubscribed_at is null and created_at > now() - interval '120 days'
        and (followup_sent_at < now() - interval '5 days' or (followup_sent_at is null and created_at < now() - interval '7 days'))
      order by created_at limit ${limit} for update skip locked)
    returning l.id, l.name, l.email, l.audited_url, l.score::float as score, l.warnings, l.top_issues, l.report_url`;
  for (const r of reviews) {
    try {
      await sendMail({ ...reviewMail(toData(r), REVIEW_URL), replyTo: process.env.SMTP_USER, fromName: 'Raquel · Agentics Projects' });
      out.reviews++;
    } catch (error) {
      out.failed++; log('reseña', error);
      await sql`update seo_audit.leads set review_requested_at = null where id = ${r.id}`;
    }
  }
  return out;
}
