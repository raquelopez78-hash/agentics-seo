-- Informes guardados en servidor para el enlace público /r/<id>.
-- El enlace solo se sirve cuando el informe se ha desbloqueado (lead captado).
create table if not exists seo_audit.reports (
  id text primary key,
  created_at timestamptz not null default now(),
  host text not null,
  final_url text not null,
  score numeric(5,1) not null,
  report jsonb not null,
  unlocked boolean not null default false
);
create index if not exists reports_created_idx on seo_audit.reports (created_at desc);
alter table seo_audit.reports enable row level security;

-- Limpieza sugerida (programar en Supabase → Cron o ejecutar a mano):
-- delete from seo_audit.reports where unlocked = false and created_at < now() - interval '2 days';
-- delete from seo_audit.reports where created_at < now() - interval '180 days';
