-- Leads de la auditoría SEO. Esquema propio, sin acceso desde la API REST pública de Supabase.
create schema if not exists seo_audit;
revoke all on schema seo_audit from public, anon, authenticated;

create table if not exists seo_audit.leads (
  id text primary key,
  created_at timestamptz not null default now(),
  name text not null,
  email text not null,
  company text not null default '',
  audited_url text not null,
  score numeric(5,1),
  grade text not null default '',
  fails integer not null default 0,
  warnings integer not null default 0,
  top_issues jsonb not null default '[]'::jsonb,
  marketing_consent boolean not null default false,
  privacy_version text not null,
  webhook_status text not null default 'skipped'
);
create index if not exists leads_email_idx on seo_audit.leads (lower(email));
create index if not exists leads_created_idx on seo_audit.leads (created_at desc);

-- RLS activo sin políticas: solo el propietario (conexión de servidor vía DATABASE_URL) puede leer/escribir.
alter table seo_audit.leads enable row level security;
