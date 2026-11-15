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
