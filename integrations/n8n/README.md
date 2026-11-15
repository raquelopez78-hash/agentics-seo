# n8n · Leads de la auditoría → Airtable

1. **Airtable:** crea una tabla `Leads auditoría SEO` con estas columnas (tipo sugerido):
   `ID` (texto) · `Fecha` (texto o fecha ISO) · `Nombre` · `Email` (email) · `Empresa` · `URL auditada` (URL) · `Puntuación` (número, 1 decimal) · `Nota` · `Errores` (número) · `Mejoras` (número) · `Problemas principales` (texto largo) · `Consentimiento marketing` (casilla).
2. **n8n:** Workflows → Import from file → `seo-audit-leads.json`.
3. En el nodo **Airtable · Crear lead**: asigna tu credencial y sustituye `appXXXX…` (base) y `tblXXXX…` (tabla).
4. En **Validar y mapear**: cambia `CAMBIA_ESTE_SECRETO` por un valor largo y aleatorio.
5. Activa el workflow y copia la **Production URL** del webhook.
6. En Vercel: `SEO_LEADS_WEBHOOK_URL` = esa URL y `SEO_LEADS_WEBHOOK_SECRET` = el mismo secreto.

Ampliaciones habituales tras "Airtable · Crear lead": email de seguimiento (Gmail/Resend), aviso en Slack o alta en el CRM si `Consentimiento marketing` es verdadero.
