# n8n · Leads de la auditoría → Airtable + Gmail

1. **Airtable:** crea una tabla `Leads auditoría SEO` con estas columnas (tipo sugerido):
   `ID` (texto) · `Fecha` (texto o fecha ISO) · `Nombre` · `Email` (email) · `Empresa` · `URL auditada` (URL) · `Puntuación` (número, 1 decimal) · `Nota` · `Errores` (número) · `Mejoras` (número) · `Problemas principales` (texto largo) · `Consentimiento marketing` (casilla) · `Informe online` (URL).
2. **n8n:** Workflows → Import from file → `seo-audit-leads.json`.
3. En el nodo **Airtable · Crear lead**: asigna tu credencial y sustituye `appXXXX…` (base) y `tblXXXX…` (tabla).
4. En **Validar y mapear**: cambia `CAMBIA_ESTE_SECRETO` por un valor largo y aleatorio.
5. En **Gmail · Informe al lead** y **Gmail · Aviso interno**: asigna tu credencial de Gmail (OAuth2). El aviso interno va a `agenticsprojects@gmail.com`; cámbialo si quieres.
6. Activa el workflow y copia la **Production URL** del webhook.
7. En Vercel: `SEO_LEADS_WEBHOOK_URL` = esa URL y `SEO_LEADS_WEBHOOK_SECRET` = el mismo secreto.

Flujo: Webhook → validación → Airtable → respuesta 200 a la web → email al lead con su nota, lo más urgente y CTA a llamada → aviso interno.

Notas:
- El email al lead se ampara en la finalidad aceptada ("enviarte el informe y contactarte en relación con tu auditoría"). Las campañas comerciales posteriores solo a quien marcó `Consentimiento marketing`.
- Gmail personal tiene límites diarios de envío (~500); para volumen alto, usa Google Workspace o Resend.
- Ampliaciones: secuencia de seguimiento a los 3 y 7 días, aviso en Slack o alta en el CRM.

---

## Alternativa sin URL pública: n8n local consultando Supabase (`seo-audit-leads-polling.json`)
Para un n8n que no es accesible desde internet (por ejemplo `localhost`). Cada 5 minutos recoge los leads pendientes de `seo_audit.leads`, los envía a Airtable y Gmail y los marca como `sent`. Si el PC está apagado, los leads esperan en Supabase y se procesan al volver.

1. **Credencial Postgres** en n8n (Credentials → New → Postgres):
   Host `aws-1-eu-west-2.pooler.supabase.com` · Port `5432` (Session pooler) · Database `postgres` · User `seo_app.gttypuluhhmpfhbfrevv` · Password la del usuario `seo_app` · SSL `require`. Nómbrala **Supabase · seo_app**.
2. Importa `seo-audit-leads-polling.json` (o copia el JSON y pégalo con Ctrl+V en un workflow vacío).
3. Asigna credenciales en **Supabase · Leads nuevos**, **Supabase · Marcar enviado**, **Airtable · Crear lead** (y base/tabla) y los dos nodos **Gmail**.
4. Activa el workflow.

Estados de `webhook_status`: `skipped` (pendiente) → `processing` (recogido; se reintenta si pasa >30 min) → `sent`. Si un email falla, el workflow continúa y el lead queda marcado como enviado tras crear la fila en Airtable; revísalo allí.
