import { randomUUID } from 'node:crypto';
import { pg } from '@/db/pg';
import { LEAD_PRIVACY_VERSION, LeadInputError, parseLead, type Lead } from '@/lib/seo-audit/lead';
import { clientIp, rateLimited } from '@/lib/seo-audit/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

// Envía el lead a n8n (u otro webhook) si SEO_LEADS_WEBHOOK_URL está configurada. SEO_LEADS_WEBHOOK_SECRET va en la cabecera x-webhook-secret.
async function sendWebhook(id: string, lead: Lead): Promise<'sent' | 'failed' | 'skipped'> {
  const url = process.env.SEO_LEADS_WEBHOOK_URL;
  if (!url) return 'skipped';
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(8000),
      headers: { 'content-type': 'application/json', ...(process.env.SEO_LEADS_WEBHOOK_SECRET ? { 'x-webhook-secret': process.env.SEO_LEADS_WEBHOOK_SECRET } : {}) },
      body: JSON.stringify({ event: 'seo_audit.lead', id, createdAt: new Date().toISOString(), ...lead }),
    });
    return res.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}

// POST { name, email, company, privacy, marketing, report } → guarda el lead y desbloquea el informe completo.
export async function POST(request: Request) {
  if (rateLimited(`lead:${clientIp(request)}`, 10, 60 * 60_000)) return json({ error: 'Demasiados envíos. Inténtalo más tarde.' }, 429);
  const raw = await request.text();
  if (raw.length > 400_000) return json({ error: 'Solicitud demasiado grande.' }, 413);
  let lead: Lead;
  try {
    lead = parseLead(JSON.parse(raw));
  } catch (error) {
    return json({ error: error instanceof LeadInputError ? error.message : 'Datos no válidos.' }, 400);
  }
  const id = randomUUID();
  const webhook = await sendWebhook(id, lead);
  let stored = false;
  if (process.env.DATABASE_URL) {
    try {
      const sql = pg();
      await sql`insert into seo_audit.leads
        (id, name, email, company, audited_url, score, grade, fails, warnings, top_issues, marketing_consent, privacy_version, webhook_status)
        values (${id}, ${lead.name}, ${lead.email}, ${lead.company}, ${lead.auditedUrl}, ${lead.score}, ${lead.grade}, ${lead.fails}, ${lead.warnings},
        ${sql.json(lead.topIssues)}, ${lead.marketing}, ${LEAD_PRIVACY_VERSION}, ${webhook})`;
      stored = true;
    } catch (error) {
      console.error('seo-audit lead', (error as { code?: string })?.code ?? error);
    }
  }
  if (!stored && webhook !== 'sent') return json({ error: 'No se pudo registrar tu solicitud. Inténtalo de nuevo en unos minutos.' }, 503);
  return json({ ok: true });
}
