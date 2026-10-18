create index if not exists purchase_lots_invoice_line_id_idx
  on public.purchase_lots (invoice_line_id)
  where invoice_line_id is not null;
