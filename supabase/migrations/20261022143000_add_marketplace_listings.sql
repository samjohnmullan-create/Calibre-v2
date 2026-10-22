create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  sale_id uuid references public.sales(id) on delete set null,
  provider text not null default 'ebay' check (provider in ('ebay')),
  environment text not null default 'production' check (environment in ('sandbox','production')),
  status text not null default 'draft' check (status in ('draft','verified','live','ended','sold','error')),
  external_listing_id text,
  listing_url text not null default '',
  title text not null default '',
  asking_price numeric,
  currency text not null default 'AUD',
  category_id text not null default '',
  condition_id text not null default '',
  quantity integer not null default 1 check (quantity > 0),
  listing_type text not null default 'FixedPriceItem',
  duration text not null default 'GTC',
  payment_profile_id text not null default '',
  return_profile_id text not null default '',
  shipping_profile_id text not null default '',
  verification jsonb not null default '{}'::jsonb,
  provider_snapshot jsonb not null default '{}'::jsonb,
  verified_at timestamptz,
  published_at timestamptz,
  ended_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketplace_listings_workspace_item_idx
  on public.marketplace_listings(workspace_id, item_id, provider, created_at desc);

create unique index if not exists marketplace_listings_external_unique
  on public.marketplace_listings(provider, environment, external_listing_id)
  where external_listing_id is not null;

alter table public.marketplace_listings enable row level security;

drop policy if exists marketplace_listings_select on public.marketplace_listings;
create policy marketplace_listings_select on public.marketplace_listings
for select to authenticated
using (
  exists (
    select 1 from public.workspace_members m
    where m.workspace_id = marketplace_listings.workspace_id
      and m.user_id = (select auth.uid())
  )
);

drop policy if exists marketplace_listings_insert on public.marketplace_listings;
create policy marketplace_listings_insert on public.marketplace_listings
for insert to authenticated
with check (
  exists (
    select 1 from public.workspace_members m
    where m.workspace_id = marketplace_listings.workspace_id
      and m.user_id = (select auth.uid())
      and m.role = any(array['owner'::text, 'editor'::text])
  )
);

drop policy if exists marketplace_listings_update on public.marketplace_listings;
create policy marketplace_listings_update on public.marketplace_listings
for update to authenticated
using (
  exists (
    select 1 from public.workspace_members m
    where m.workspace_id = marketplace_listings.workspace_id
      and m.user_id = (select auth.uid())
      and m.role = any(array['owner'::text, 'editor'::text])
  )
)
with check (
  exists (
    select 1 from public.workspace_members m
    where m.workspace_id = marketplace_listings.workspace_id
      and m.user_id = (select auth.uid())
      and m.role = any(array['owner'::text, 'editor'::text])
  )
);

drop policy if exists marketplace_listings_delete on public.marketplace_listings;
create policy marketplace_listings_delete on public.marketplace_listings
for delete to authenticated
using (
  exists (
    select 1 from public.workspace_members m
    where m.workspace_id = marketplace_listings.workspace_id
      and m.user_id = (select auth.uid())
      and m.role = any(array['owner'::text, 'editor'::text])
  )
);