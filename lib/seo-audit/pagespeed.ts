// Core Web Vitals vía PageSpeed Insights API (Lighthouse móvil + datos reales CrUX si existen). PAGESPEED_API_KEY opcional (sube la cuota).
import type { AuditCheck, CheckStatus } from './scoring.ts';

type Metric = { percentile?: number; category?: string };
type Psi = {
  loadingExperience?: { metrics?: Record<string, Metric> };
  lighthouseResult?: { categories?: { performance?: { score?: number } }; audits?: Record<string, { numericValue?: number; displayValue?: string }> };
  error?: { message?: string };
};

const band = (v: number, good: number, poor: number): CheckStatus => (v <= good ? 'pass' : v <= poor ? 'warning' : 'fail');

export async function pageSpeedChecks(url: string): Promise<AuditCheck[]> {
  const api = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  api.searchParams.set('url', url);
  api.searchParams.set('strategy', 'mobile');
  api.searchParams.set('category', 'performance');
  if (process.env.PAGESPEED_API_KEY) api.searchParams.set('key', process.env.PAGESPEED_API_KEY);
  let data: Psi;
  try {
    const res = await fetch(api, { signal: AbortSignal.timeout(55_000) });
    data = (await res.json()) as Psi;
    if (!res.ok) throw new Error(data.error?.message ?? `HTTP ${res.status}`);
  } catch (error) {
    return [{ id: 'cwv', label: 'Core Web Vitals (PageSpeed)', status: 'na', message: `PageSpeed no respondió: ${(error instanceof Error ? error.message : 'error').slice(0, 120)}` }];
  }
  const src = 'https://web.dev/articles/vitals';
  const out: AuditCheck[] = [];
  const score = data.lighthouseResult?.categories?.performance?.score;
  if (typeof score === 'number') {
    const s = Math.round(score * 100);
    out.push({ id: 'psi_score', label: 'Lighthouse móvil', status: s >= 90 ? 'pass' : s >= 50 ? 'warning' : 'fail', message: `Puntuación de rendimiento ${s}/100.`, source: 'https://pagespeed.web.dev/' });
  }
  const field = data.loadingExperience?.metrics ?? {};
  const audits = data.lighthouseResult?.audits ?? {};
  const pick = (fieldKey: string, labKey: string) => field[fieldKey]?.percentile ?? audits[labKey]?.numericValue;
  const real = Object.keys(field).length > 0 ? 'datos reales (CrUX)' : 'laboratorio';
  const lcp = pick('LARGEST_CONTENTFUL_PAINT_MS', 'largest-contentful-paint');
  if (lcp !== undefined) out.push({ id: 'lcp', label: 'LCP', status: band(lcp, 2500, 4000), message: `${(lcp / 1000).toFixed(1)} s (${real}; bueno ≤ 2,5 s).`, fix: 'Optimiza la imagen/elemento principal, preload y servidor rápido.', source: src });
  const clsRaw = field.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile;
  const cls = clsRaw !== undefined ? clsRaw / 100 : audits['cumulative-layout-shift']?.numericValue;
  if (cls !== undefined) out.push({ id: 'cls', label: 'CLS', status: band(cls, 0.1, 0.25), message: `${cls.toFixed(2)} (${real}; bueno ≤ 0,1).`, fix: 'Reserva espacio a imágenes, iframes y banners.', source: src });
  const inp = field.INTERACTION_TO_NEXT_PAINT?.percentile;
  if (inp !== undefined) out.push({ id: 'inp', label: 'INP', status: band(inp, 200, 500), message: `${inp} ms (datos reales; bueno ≤ 200 ms).`, fix: 'Reduce JavaScript en el hilo principal.', source: src });
  else {
    const tbt = audits['total-blocking-time']?.numericValue;
    if (tbt !== undefined) out.push({ id: 'tbt', label: 'TBT (aprox. INP)', status: band(tbt, 200, 600), message: `${Math.round(tbt)} ms de bloqueo (laboratorio; bueno ≤ 200 ms).`, fix: 'Divide y difiere el JavaScript.', source: src });
  }
  return out.length ? out : [{ id: 'cwv', label: 'Core Web Vitals (PageSpeed)', status: 'na', message: 'PageSpeed no devolvió métricas.' }];
}
