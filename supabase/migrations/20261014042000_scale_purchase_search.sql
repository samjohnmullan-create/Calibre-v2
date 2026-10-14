alter table public.purchases
  add column if not exists search_text text generated always as (
    coalesce(vendor_name, '') || ' ' ||
    coalesce(channel, '') || ' ' ||
    coalesce(external_order_id, '') || ' ' ||
    coalesce(description, '') || ' ' ||
    coalesce(tracking_number, '') || ' ' ||
    coalesce(notes, '') || ' ' ||
    coalesce(status, '')
  ) stored;

create index if not exists purchases_search_text_trgm_idx
  on public.purchases using gin (search_text extensions.gin_trgm_ops);

create index if not exists purchases_workspace_created_idx
  on public.purchases (workspace_id, created_at desc);
