// Tipos y puntuación de la auditoría SEO. Módulo puro (sin red) para poder probarlo con node --test.

export type CheckStatus = 'pass' | 'warning' | 'fail' | 'na' | 'no_api' | 'pending';

export type CategoryId =
  | 'crawling' | 'url_arch' | 'onpage' | 'content' | 'structured_data'
  | 'performance' | 'mobile_a11y' | 'trust_eeat' | 'international' | 'ai_geo';

export type CheckItem = { label: string; ok: boolean | null; value?: string };

export type AuditCheck = {
  id: string;
  label: string;
  status: CheckStatus;
  message: string;
  evidence?: string;
  fix?: string;
  source?: string;
  items?: CheckItem[];
};

export type AuditCategory = { id: CategoryId; name: string; score: number | null; checks: AuditCheck[] };

export type AuditReport = {
  /** Identificador del informe guardado (solo con base de datos). */
  id?: string;
  url: string;
  finalUrl: string;
  generatedAt: string;
  score: number;
  grade: string;
  summary: string;
  ai: { enabled: boolean; engine?: string; warning?: string };
  categories: AuditCategory[];
};

export const CATEGORY_NAMES: Record<CategoryId, string> = {
  crawling: 'Rastreo e indexación',
  url_arch: 'URL y arquitectura',
  onpage: 'Etiquetas on-page',
  content: 'Contenido',
  structured_data: 'Datos estructurados',
  performance: 'Rendimiento y Core Web Vitals',
  mobile_a11y: 'Móvil y accesibilidad',
  trust_eeat: 'Confianza y E-E-A-T',
  international: 'Internacional',
  ai_geo: 'AI SEO / GEO',
};

export const CATEGORY_WEIGHTS: Record<CategoryId, number> = {
  crawling: 12, url_arch: 6, onpage: 10, content: 14, structured_data: 10,
  performance: 14, mobile_a11y: 8, trust_eeat: 10, international: 3, ai_geo: 15,
};

const WARNING_CREDIT = 0.25;
const FAIL_CAP = 35;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** 100 puntos repartidos entre los checks aplicables; un fallo limita la categoría a 35. null = nada evaluable. */
export function scoreChecks(checks: AuditCheck[]): number | null {
  const applicable = checks.filter((c) => c.status === 'pass' || c.status === 'warning' || c.status === 'fail');
  if (!applicable.length) return null;
  const per = 100 / applicable.length;
  let earned = 0;
  let hasFail = false;
  for (const c of applicable) {
    if (c.status === 'pass') earned += per;
    else if (c.status === 'warning') earned += per * WARNING_CREDIT;
    else hasFail = true;
  }
  return round1(hasFail ? Math.min(earned, FAIL_CAP) : earned);
}

export function overallScore(categories: AuditCategory[]): number {
  const scored = categories.filter((c) => c.score !== null);
  const totalW = scored.reduce((s, c) => s + CATEGORY_WEIGHTS[c.id], 0);
  if (!totalW) return 0;
  return round1(scored.reduce((s, c) => s + (c.score as number) * CATEGORY_WEIGHTS[c.id], 0) / totalW);
}

export function gradeFor(score: number): string {
  if (score >= 90) return 'Excelente';
  if (score >= 75) return 'Bueno';
  if (score >= 55) return 'Mejorable';
  if (score >= 35) return 'Deficiente';
  return 'Crítico';
}

/** Recalcula puntuaciones de categorías, global, nota y resumen. */
export function finalizeReport(report: Omit<AuditReport, 'score' | 'grade' | 'summary'>): AuditReport {
  const categories = report.categories.map((c) => ({ ...c, score: scoreChecks(c.checks) }));
  const score = overallScore(categories);
  const all = categories.flatMap((c) => c.checks);
  const fails = all.filter((c) => c.status === 'fail').length;
  const warns = all.filter((c) => c.status === 'warning').length;
  return {
    ...report,
    categories,
    score,
    grade: gradeFor(score),
    summary: `${fails} problema${fails === 1 ? '' : 's'} crítico${fails === 1 ? '' : 's'} y ${warns} aspecto${warns === 1 ? '' : 's'} a mejorar en ${all.length} comprobaciones.`,
  };
}

/** Informe en Markdown para descargar o pegar en un CRM / n8n. */
export function reportToMarkdown(r: AuditReport): string {
  const icon: Record<CheckStatus, string> = { pass: '✅', warning: '⚠️', fail: '❌', na: '➖', no_api: '🔒', pending: '⏳' };
  const lines = [`# Auditoría SEO · ${r.finalUrl}`, '', `- **Puntuación:** ${r.score}/100 (${r.grade})`, `- **Fecha:** ${r.generatedAt}`, `- ${r.summary}`, ''];
  for (const c of r.categories) {
    lines.push(`## ${c.name} — ${c.score === null ? 'no evaluado' : `${c.score}/100`}`, '');
    for (const k of c.checks) {
      lines.push(`- ${icon[k.status]} **${k.label}:** ${k.message}`);
      if (k.evidence) lines.push(`  - Evidencia: \`${k.evidence.replace(/`/g, "'")}\``);
      for (const it of k.items ?? []) lines.push(`  - ${it.ok === true ? '✓' : it.ok === false ? '✕' : '·'} ${it.label}${it.value ? `: ${it.value}` : ''}`);
      if (k.fix && (k.status === 'fail' || k.status === 'warning')) lines.push(`  - Solución: ${k.fix}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
