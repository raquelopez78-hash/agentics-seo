-- Plan Pro: cuentas de pago (Stripe), enlaces de acceso por email e historial de informes.
create table if not exists seo_audit.pro_accounts (
  email text primary key,                       -- siempre en minúsculas
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  stripe_customer_id text unique,
  stripe_subscription_id text,
  status text not null default 'inactive',      -- estado de la suscripción en Stripe
  plan text,                                    -- monthly | yearly
  current_period_end timestamptz,
  brand_name text,
  brand_logo text                               -- data URL (png/jpeg/webp, máx. ~150 KB)
);

create table if not exists seo_audit.login_tokens (
  token_hash text primary key,                  -- sha256 del token; el token solo viaja en el email
  email text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index if not exists login_tokens_email_idx on seo_audit.login_tokens (email, created_at desc);

alter table seo_audit.reports add column if not exists owner_email text;
create index if not exists reports_owner_idx on seo_audit.reports (owner_email, created_at desc) where owner_email is not null;

alter table seo_audit.pro_accounts enable row level security;
alter table seo_audit.login_tokens enable row level security;

-- Rol de la aplicación (si existe): mismo acceso que en el resto de tablas.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'seo_app') then
    execute 'grant select, insert, update, delete on seo_audit.pro_accounts, seo_audit.login_tokens to seo_app';
    if not exists (select 1 from pg_policies where schemaname = 'seo_audit' and tablename = 'pro_accounts' and policyname = 'seo_app_all') then
      execute 'create policy seo_app_all on seo_audit.pro_accounts for all to seo_app using (true) with check (true)';
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'seo_audit' and tablename = 'login_tokens' and policyname = 'seo_app_all') then
      execute 'create policy seo_app_all on seo_audit.login_tokens for all to seo_app using (true) with check (true)';
    end if;
  end if;
end $$;

-- Limpieza sugerida: delete from seo_audit.login_tokens where expires_at < now() - interval '1 day';
