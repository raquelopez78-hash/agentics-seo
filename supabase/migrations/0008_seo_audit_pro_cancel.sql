-- Suscripción cancelada al final del periodo (sigue activa hasta current_period_end).
alter table seo_audit.pro_accounts add column if not exists cancel_at_period_end boolean not null default false;
