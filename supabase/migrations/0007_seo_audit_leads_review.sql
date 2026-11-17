-- Petición de reseña (una sola por lead): cuándo se envió (null = pendiente).
alter table seo_audit.leads add column if not exists review_requested_at timestamptz;
create index if not exists leads_review_idx on seo_audit.leads (created_at) where review_requested_at is null;
