import { AuditInputError, normalizeUrl } from '@/lib/seo-audit/fetcher';
import { pageSpeedChecks } from '@/lib/seo-audit/pagespeed';
import { clientIp, rateLimited } from '@/lib/seo-audit/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

// POST { url } → checks de Core Web Vitals para fusionar en la categoría "performance".
export async function POST(request: Request) {
  if (rateLimited(`psi:${clientIp(request)}`, 15, 60 * 60_000)) return Response.json({ error: 'Límite alcanzado.' }, { status: 429 });
  try {
    const body = (await request.json()) as { url?: unknown };
    const url = normalizeUrl(typeof body.url === 'string' ? body.url : '');
    return Response.json({ checks: await pageSpeedChecks(url.toString()) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof AuditInputError ? error.message : 'Solicitud no válida.' }, { status: 400 });
  }
}
