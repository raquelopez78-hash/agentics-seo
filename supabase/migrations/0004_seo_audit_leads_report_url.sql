-- Enlace público del informe en cada lead (para el email y para el procesado desde n8n).
alter table seo_audit.leads add column if not exists report_url text not null default '';
create index if not exists leads_pending_idx on seo_audit.leads (created_at) where webhook_status <> 'sent';
-- Cuándo recogió n8n el lead (para reintentar solo los que lleven >30 min "en proceso").
alter table seo_audit.leads add column if not exists claimed_at timestamptz;
