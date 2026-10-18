alter table public.customer_publications
  add column if not exists document_config jsonb not null default '{"passport":{"identity":true,"movement":true,"summary":true,"provenance":true,"condition":true,"service":true,"timing":true,"evidence":true,"gallery":true,"qr":true},"certificate":{"identity":true,"movement":true,"case":true,"condition":false,"service":false,"timing":true,"evidence":true,"hero_image":false,"qr":true}}'::jsonb,
  add column if not exists passport_pdf_url text,
  add column if not exists certificate_pdf_url text,
  add column if not exists customer_pack_issued_at timestamptz;

comment on column public.customer_publications.document_config is 'Customer-controlled inclusion settings for the public Passport and Certificate documents.';
comment on column public.customer_publications.passport_pdf_url is 'Public URL of the issued Passport PDF snapshot.';
comment on column public.customer_publications.certificate_pdf_url is 'Public URL of the issued Certificate PDF snapshot.';
comment on column public.customer_publications.customer_pack_issued_at is 'Timestamp when the current customer document pack was issued.';
