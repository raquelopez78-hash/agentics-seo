-- Marca blanca: datos de contacto de la agencia en el pie del PDF.
alter table seo_audit.pro_accounts add column if not exists brand_contact text;
