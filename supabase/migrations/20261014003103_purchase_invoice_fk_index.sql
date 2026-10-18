create index if not exists purchases_invoice_id_idx on public.purchases (invoice_id) where invoice_id is not null;
