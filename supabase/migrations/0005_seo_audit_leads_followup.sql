-- Seguimiento a los 2-3 días: cuándo se envió (null = pendiente).
alter table seo_audit.leads add column if not exists followup_sent_at timestamptz;
create index if not exists leads_followup_idx on seo_audit.leads (created_at) where followup_sent_at is null;
