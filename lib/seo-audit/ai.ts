// Análisis cualitativo con IA (Claude → GPT de respaldo, vía lib/ai-client). Sin clave configurada, los checks quedan como "no_api".
import { aiStatus, runStructured, strictObject } from '@/lib/ai-client';
import type { AuditCheck, CategoryId, CheckStatus } from './scoring.ts';

const AI_CHECKS: { id: string; cat: CategoryId; label: string }[] = [
  { id: 'llm_intent', cat: 'content', label: 'Intención de búsqueda' },
  { id: 'llm_depth', cat: 'content', label: 'Profundidad y originalidad' },
  { id: 'llm_grammar', cat: 'content', label: 'Ortografía y redacción' },
  { id: 'llm_eeat', cat: 'trust_eeat', label: 'Experiencia y autoridad (E-E-A-T)' },
  { id: 'llm_citability', cat: 'ai_geo', label: 'Citabilidad por IA' },
  { id: 'llm_summary', cat: 'ai_geo', label: 'Resumen claro para asistentes' },
];

const itemSchema = strictObject({
  status: { type: 'string', enum: ['pass', 'warning', 'fail'] },
  message: { type: 'string', description: 'Diagnóstico concreto en 1-2 frases, en español.' },
  fix: { type: 'string', description: 'Acción recomendada concreta, en español.' },
});

const SYSTEM = `Eres un auditor SEO senior especializado en SEO clásico y GEO (optimización para asistentes de IA).
Evalúa SOLO con el contenido proporcionado; no inventes datos. Sé estricto pero justo: "pass" solo si cumple claramente.
Criterios:
- llm_intent: ¿el contenido responde a una intención de búsqueda clara y coherente con title/H1?
- llm_depth: ¿cobertura temática, profundidad y aporte original frente a contenido genérico?
- llm_grammar: errores ortográficos o de redacción relevantes.
- llm_eeat: señales de experiencia real, autoría, credenciales, datos, casos.
- llm_citability: ¿hay afirmaciones concretas, datos, definiciones y respuestas directas que un asistente de IA pueda citar?
- llm_summary: ¿se entiende en las primeras líneas qué es, para quién y qué ofrece la marca/página?`;

export type AiResult = { checks: Partial<Record<CategoryId, AuditCheck[]>>; enabled: boolean; engine?: string; warning?: string };

export async function analyzeWithAi(input: { url: string; title: string; description: string; h1: string; text: string }): Promise<AiResult> {
  const placeholder = (status: CheckStatus, message: string): AiResult['checks'] => {
    const out: AiResult['checks'] = {};
    for (const c of AI_CHECKS) (out[c.cat] ??= []).push({ id: c.id, label: c.label, status, message });
    return out;
  };
  if (aiStatus().engine === 'basic') return { enabled: false, checks: placeholder('no_api', 'Requiere IA: configura ANTHROPIC_API_KEY u OPENAI_API_KEY.') };
  try {
    const result = await runStructured({
      name: 'seo_content_audit',
      system: SYSTEM,
      user: `URL: ${input.url}\nTITLE: ${input.title}\nMETA DESCRIPTION: ${input.description}\nH1: ${input.h1}\n\nTEXTO VISIBLE (recortado):\n${input.text.slice(0, 12_000)}`,
      schema: strictObject(Object.fromEntries(AI_CHECKS.map((c) => [c.id, itemSchema]))),
      maxTokens: 1800,
      timeoutMs: 40_000,
    });
    const data = result.data as Record<string, { status: CheckStatus; message: string; fix: string }>;
    const checks: AiResult['checks'] = {};
    for (const c of AI_CHECKS) {
      const r = data[c.id];
      const status: CheckStatus = r && ['pass', 'warning', 'fail'].includes(r.status) ? r.status : 'na';
      (checks[c.cat] ??= []).push({ id: c.id, label: `${c.label} · IA`, status, message: r?.message ?? 'Sin respuesta.', fix: r?.fix });
    }
    return { enabled: true, engine: result.engine, warning: result.warning, checks };
  } catch (error) {
    return { enabled: false, warning: error instanceof Error ? error.message : 'La IA no respondió.', checks: placeholder('no_api', 'El análisis con IA no está disponible ahora mismo.') };
  }
}
