import { analyzeWithAi } from '@/lib/seo-audit/ai';
import { pageBasics, runChecks } from '@/lib/seo-audit/checks';
import { recordAudit } from '@/lib/seo-audit/counter';
import { isActivePro } from '@/lib/pro/accounts';
import { sessionEmail } from '@/lib/pro/session';
import { reportUrl, saveReport } from '@/lib/seo-audit/reports';
import { toTeaser } from '@/lib/seo-audit/teaser';
import { AuditInputError, fetchPage } from '@/lib/seo-audit/fetcher';
import { clientIp, rateLimited } from '@/lib/seo-audit/rate-limit';
import { finalizeReport } from '@/lib/seo-audit/scoring';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

// POST { url } → informe completo salvo Core Web Vitals (se piden aparte en /api/seo-audit/performance).
export async function POST(request: Request) {
  // Plan Pro (sesión iniciada): sin formulario, informe completo y guardado en su historial.
  const email = await sessionEmail();
  const pro = email && (await isActivePro(email)) ? email : null;
  if (rateLimited(pro ? `audit-pro:${pro}` : `audit:${clientIp(request)}`, pro ? 120 : 10, 60 * 60_000)) return json({ error: 'Has alcanzado el límite de auditorías por hora. Inténtalo más tarde.' }, 429);
  let url = '';
  try {
    const body = (await request.json()) as { url?: unknown };
    url = typeof body.url === 'string' ? body.url : '';
  } catch {
    return json({ error: 'Cuerpo JSON no válido.' }, 400);
  }
  try {
    const page = await fetchPage(url);
    const categories = runChecks(page);
    const ai = await analyzeWithAi({ url: page.finalUrl, ...pageBasics(page.html) });
    for (const cat of categories) cat.checks.push(...(ai.checks[cat.id] ?? []));
    const report = finalizeReport({
      url: page.url,
      finalUrl: page.finalUrl,
      generatedAt: new Date().toISOString(),
      ai: { enabled: ai.enabled, engine: ai.engine, warning: ai.warning },
      categories,
    });
    await recordAudit(new URL(report.finalUrl).hostname, report.score);
    report.id = await saveReport(report, pro);
    if (pro) return json({ ...report, pro: true, shareUrl: report.id ? reportUrl(report.id) : null });
    // Con base de datos, el informe completo se entrega solo tras dejar los datos (POST /api/audit/lead).
    return json(report.id ? toTeaser(report) : report);
  } catch (error) {
    if (error instanceof AuditInputError) return json({ error: error.message }, 400);
    console.error('seo-audit', error);
    return json({ error: 'No se pudo completar la auditoría.' }, 500);
  }
}
