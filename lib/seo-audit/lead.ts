// Validación y normalización del lead de la auditoría SEO. Módulo puro (probado con node --test).
import type { AuditReport } from './scoring.ts';

export const LEAD_PRIVACY_VERSION = 'seo-audit-2026-11';
export const LEAD_PRIVACY_NOTICE =
  'Responsable: AGENTICS PROJECTS (agenticsprojects@gmail.com). Finalidad: enviarte el informe y contactarte en relación con tu auditoría. Base jurídica: tu consentimiento. Si marcas la casilla de comunicaciones, también te enviaremos contenidos y ofertas sobre SEO, IA y automatización; puedes darte de baja en cualquier momento. Conservación: hasta que retires el consentimiento o un máximo de 24 meses. Proveedores: Vercel, Supabase y, en su caso, n8n, con posibles transferencias internacionales bajo cláusulas contractuales tipo. Derechos: acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo al correo indicado, y reclamación ante la AEPD.';

export type LeadInput = { name: string; email: string; company: string; privacy: boolean; marketing: boolean };

export type Lead = LeadInput & {
  auditedUrl: string;
  score: number | null;
  grade: string;
  fails: number;
  warnings: number;
  topIssues: { label: string; message: string; category: string }[];
};

export class LeadInputError extends Error {
  readonly status = 400;
}

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function parseLead(body: unknown): Lead {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const name = clean(b.name, 120);
  const email = clean(b.email, 254).toLowerCase();
  if (name.length < 2) throw new LeadInputError('Indica tu nombre.');
  if (!EMAIL.test(email)) throw new LeadInputError('Introduce un email válido.');
  if (b.privacy !== true) throw new LeadInputError('Debes aceptar la política de privacidad.');
  const r = (b.report && typeof b.report === 'object' ? b.report : {}) as Partial<AuditReport>;
  const auditedUrl = clean(r.finalUrl, 2000);
  if (!/^https?:\/\//i.test(auditedUrl)) throw new LeadInputError('Falta la URL auditada.');
  const checks = (Array.isArray(r.categories) ? r.categories : []).flatMap((c) => (Array.isArray(c?.checks) ? c.checks.map((k) => ({ ...k, category: clean(c.name, 80) })) : []));
  const score = typeof r.score === 'number' && r.score >= 0 && r.score <= 100 ? Math.round(r.score * 10) / 10 : null;
  return {
    name,
    email,
    company: clean(b.company, 160),
    privacy: true,
    marketing: b.marketing === true,
    auditedUrl,
    score,
    grade: clean(r.grade, 30),
    fails: checks.filter((k) => k?.status === 'fail').length,
    warnings: checks.filter((k) => k?.status === 'warning').length,
    topIssues: checks.filter((k) => k?.status === 'fail').slice(0, 10).map((k) => ({ label: clean(k.label, 120), message: clean(k.message, 300), category: k.category })),
  };
}
