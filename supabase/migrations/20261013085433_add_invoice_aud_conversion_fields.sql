alter table public.acquisition_invoices
  add column if not exists exchange_rate_to_aud numeric,
  add column if not exists exchange_rate_date date,
  add column if not exists subtotal_aud numeric,
  add column if not exists fees_aud numeric,
  add column if not exists postage_aud numeric,
  add column if not exists total_aud numeric;

alter table public.acquisition_invoice_lines
  add column if not exists unit_price_aud numeric,
  add column if not exists line_total_aud numeric;
