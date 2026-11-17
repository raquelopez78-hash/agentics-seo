# AGENTICS SEO · Auditoría SEO + AI SEO

Lead magnet público: audita el SEO técnico y la visibilidad en asistentes de IA de cualquier URL. Next.js 16 en Vercel; Postgres (Supabase) y/o n8n para los leads.

## Qué evalúa
110+ comprobaciones en 10 categorías ponderadas (0-100): rastreo e indexación, URL, on-page, contenido, Schema.org, Core Web Vitals (PageSpeed), móvil y accesibilidad, E-E-A-T, internacional y AI SEO/GEO (GPTBot, ClaudeBot, PerplexityBot, llms.txt…). Checks cualitativos con IA (Claude → GPT de respaldo) si hay clave.

## Flujo
1. El usuario introduce una URL → `POST /api/audit` (informe sin CWV) y `POST /api/audit/performance` (CWV).
2. Ve nota, categorías y 3 problemas por bloque.
3. Deja nombre + email + consentimiento → `POST /api/audit/lead` → se desbloquea el detalle, el informe PDF profesional (A4: resumen, KPIs, distribución, puntuación por área, hallazgos y detalle) y el .md.

## Estructura
- `lib/seo-audit/`: `fetcher.ts` (descarga con protección SSRF), `checks.ts`, `scoring.ts`, `ai.ts`, `pagespeed.ts`, `lead.ts`, `rate-limit.ts`.
- `app/`: página (`page.tsx`, `audit-client.tsx`) y API (`api/audit/*`).
- `supabase/migrations/`: `0001` tabla `seo_audit.leads` (leads) · `0002` tabla `seo_audit.audits` (contador público: solo dominio y nota).
- Informes compartibles: cada auditoría se guarda en `seo_audit.reports` (migración `0003`) y obtiene `/r/<id>`, que solo se sirve tras captar el lead. El informe publicado es siempre el del servidor (el navegador no puede falsear la nota). `noindex, follow` e imagen OG con dominio y nota.
- Contador: `GET /api/audit/count` → `{ total, today }` (hoy en hora de Madrid, caché 60 s). Sin `DATABASE_URL` no se muestra.

## Dominio: auditoria.agenticsprojects.com
1. Vercel → proyecto → Settings → Domains → añade `auditoria.agenticsprojects.com`.
2. Hostinger (hPanel) → Dominios → agenticsprojects.com → DNS → registro **CNAME**: nombre `auditoria`, destino el valor que indique Vercel.
3. Variable `SITE_URL=https://auditoria.agenticsprojects.com` (canonical, sitemap y robots).
4. Enlaza la herramienta desde la web de la agencia (menú, footer y CTAs).

## Despliegue
1. Importa el repo en Vercel.
2. Variables (ver `.env.example`): `SITE_URL`, `ANTHROPIC_API_KEY`, y para leads `DATABASE_URL` y/o `SEO_LEADS_WEBHOOK_URL` (+ `SEO_LEADS_WEBHOOK_SECRET`). Opcional `PAGESPEED_API_KEY`.
3. Si usas Postgres, aplica las migraciones de `supabase/migrations/` en orden (SQL Editor de Supabase). Son repetibles.

## Desarrollo
```
npm install
npm run dev
npm test
```
Límite: 10 auditorías/hora por IP (en memoria por instancia).

## Planes
- **Gratis:** hasta `FREE_AUDITS_PER_EMAIL` (2) informes completos por email, siempre dejando datos. Reabrir un informe ya desbloqueado no consume cupo. A partir del límite se muestra el Plan Pro (`POST /api/audit/lead` responde 402 `FREE_LIMIT`).
- **Pro (provisional):** emails en `SEO_PRO_EMAILS` (separados por comas) sin límite, hasta integrar el pago.
