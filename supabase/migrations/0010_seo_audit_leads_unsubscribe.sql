-- Baja de los correos automáticos (enlace en el pie de cada correo).
alter table seo_audit.leads add column if not exists unsubscribed_at timestamptz;
