-- Registro mínimo de auditorías para el contador público ("X auditorías, hoy Y").
-- Solo dominio y nota: sin datos personales.
create table if not exists seo_audit.audits (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  host text not null,
  score numeric(5,1)
);
create index if not exists audits_created_idx on seo_audit.audits (created_at desc);
alter table seo_audit.audits enable row level security;
