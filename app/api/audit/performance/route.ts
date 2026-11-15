import { AuditInputError, normalizeUrl } from '@/lib/seo-audit/fetcher';
import { pageSpeedChecks } from '@/lib/seo-audit/pagespeed';
import { clientIp, rateLimited } from '@/lib/seo-audit/rate-limit';
import { isValidReportId, mergePerformance } from '@/lib/seo-audit/reports';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

// POST { url, reportId? } → checks de Core Web Vitals para fusionar en la categoría "performance".
export async function POST(request: Request) {
  if (rateLimited(`psi:${clientIp(request)}`, 15, 60 * 60_000)) return Response.json({ error: 'Límite alcanzado.' }, { status: 429 });
  try {
    const body = (await request.json()) as { url?: unknown; reportId?: unknown };
    const url = normalizeUrl(typeof body.url === 'string' ? body.url : '');
    const checks = await pageSpeedChecks(url.toString());
    if (isValidReportId(body.reportId)) await mergePerformance(body.reportId, checks);
    return Response.json({ checks }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof AuditInputError ? error.message : 'Solicitud no válida.' }, { status: 400 });
  }
}
