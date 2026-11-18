// ¿Está la web en la lista de sitios peligrosos de Google? Google Web Risk (uso comercial de la base de Safe Browsing).
// Clave: WEBRISK_API_KEY o, si no, PAGESPEED_API_KEY (misma clave de Google Cloud si el proyecto tiene la API Web Risk activada).
import type { AuditCheck } from './scoring.ts';

const THREATS: Record<string, string> = {
  MALWARE: 'software malicioso',
  SOCIAL_ENGINEERING: 'suplantación o engaño (phishing)',
  UNWANTED_SOFTWARE: 'software no deseado',
  SOCIAL_ENGINEERING_EXTENDED_COVERAGE: 'engaño (cobertura ampliada)',
};
const LABEL = 'Sin avisos de web peligrosa (Google)';
const SOURCE = 'https://transparencyreport.google.com/safe-browsing/search';

export async function checkWebRisk(url: string, fetchImpl: typeof fetch = fetch): Promise<AuditCheck> {
  const key = process.env.WEBRISK_API_KEY || process.env.PAGESPEED_API_KEY;
  if (!key) return { id: 'web_risk', label: LABEL, status: 'na', message: 'Comprobación no disponible (falta la clave de Google Web Risk).', source: SOURCE };
  const api = new URL('https://webrisk.googleapis.com/v1/uris:search');
  for (const t of ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE']) api.searchParams.append('threatTypes', t);
  api.searchParams.set('uri', url);
  api.searchParams.set('key', key);
  try {
    const res = await fetchImpl(api, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return { id: 'web_risk', label: LABEL, status: 'na', message: `Comprobación no disponible ahora mismo (Google respondió ${res.status}).`, source: SOURCE };
    const data = (await res.json()) as { threat?: { threatTypes?: string[] } };
    const types = data.threat?.threatTypes ?? [];
    if (!types.length) return { id: 'web_risk', label: LABEL, status: 'pass', message: 'Google no tiene esta URL marcada como peligrosa.', source: SOURCE };
    return {
      id: 'web_risk', label: LABEL, status: 'fail',
      message: `Google marca esta URL como peligrosa: ${types.map((t) => THREATS[t] ?? t).join(', ')}. Los navegadores muestran un aviso a los visitantes y Google la retira de sus resultados.`,
      fix: 'Limpia la web (malware, redirecciones o páginas inyectadas), actualiza CMS y plugins, cambia las contraseñas y pide la revisión en Google Search Console → Seguridad y acciones manuales → Problemas de seguridad.',
      source: SOURCE,
    };
  } catch {
    return { id: 'web_risk', label: LABEL, status: 'na', message: 'Comprobación no disponible ahora mismo.', source: SOURCE };
  }
}
