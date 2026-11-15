# AGENTICS SEO · Auditoría SEO + AI SEO

Lead magnet público: audita el SEO técnico y la visibilidad en asistentes de IA de cualquier URL. Next.js 16 en Vercel; Postgres (Supabase) y/o n8n para los leads.

## Qué evalúa
90+ comprobaciones en 10 categorías ponderadas (0-100): rastreo e indexación, URL, on-page, contenido, Schema.org, Core Web Vitals (PageSpeed), móvil y accesibilidad, E-E-A-T, internacional y AI SEO/GEO (GPTBot, ClaudeBot, PerplexityBot, llms.txt…). Checks cualitativos con IA (Claude → GPT de respaldo) si hay clave.

## Flujo
1. El usuario introduce una URL → `POST /api/audit` (informe sin CWV) y `POST /api/audit/performance` (CWV).
2. Ve nota, categorías y 3 problemas por bloque.
3. Deja nombre + email + consentimiento → `POST /api/audit/lead` → se desbloquea el detalle, el informe PDF profesional (A4: resumen, KPIs, distribución, puntuación por área, hallazgos y detalle) y el .md.

## Estructura
- `lib/seo-audit/`: `fetcher.ts` (descarga con protección SSRF), `checks.ts`, `scoring.ts`, `ai.ts`, `pagespeed.ts`, `lead.ts`, `rate-limit.ts`.
- `app/`: página (`page.tsx`, `audit-client.tsx`) y API (`api/audit/*`).
- `supabase/migrations/0001_seo_audit_leads.sql`: tabla `seo_audit.leads`.

## Despliegue
1. Importa el repo en Vercel.
2. Variables (ver `.env.example`): `SITE_URL`, `ANTHROPIC_API_KEY`, y para leads `DATABASE_URL` y/o `SEO_LEADS_WEBHOOK_URL` (+ `SEO_LEADS_WEBHOOK_SECRET`). Opcional `PAGESPEED_API_KEY`.
3. Si usas Postgres, aplica la migración en el SQL Editor de Supabase.

## Desarrollo
```
npm install
npm run dev
npm test
```
Límite: 10 auditorías/hora por IP (en memoria por instancia).
