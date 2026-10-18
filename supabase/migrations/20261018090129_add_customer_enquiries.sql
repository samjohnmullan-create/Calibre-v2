-- Customer enquiry inbox for published Calibre watches.
-- Public visitors may create enquiries but cannot read them back.

create table if not exists public.customer_enquiries (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.customer_publications(id) on delete cascade,
  name text not null,
  email text not null,
  phone text not null default '',
  message text not null,
  status text not null default 'new' check (status in ('new','replied','negotiating','sold','closed')),
  source_url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_enquiries_name_length check (char_length(btrim(name)) between 2 and 120),
  constraint customer_enquiries_email_length check (char_length(btrim(email)) between 5 and 254),
  constraint customer_enquiries_email_shape check (position('@' in email) > 1),
  constraint customer_enquiries_phone_length check (char_length(phone) <= 80),
  constraint customer_enquiries_message_length check (char_length(btrim(message)) between 10 and 4000),
  constraint customer_enquiries_source_url_length check (char_length(source_url) <= 700)
);

create index if not exists customer_enquiries_publication_created_idx
  on public.customer_enquiries (publication_id, created_at desc);
create index if not exists customer_enquiries_status_created_idx
  on public.customer_enquiries (status, created_at desc);

alter table public.customer_enquiries enable row level security;

revoke all on table public.customer_enquiries from anon, authenticated;
grant insert on table public.customer_enquiries to anon;
grant select, update on table public.customer_enquiries to authenticated;

drop policy if exists "customer_enquiries_public_insert" on public.customer_enquiries;
create policy "customer_enquiries_public_insert"
  on public.customer_enquiries for insert to anon
  with check (
    status = 'new'
    and exists (
      select 1
      from public.customer_publications p
      where p.id = customer_enquiries.publication_id
        and p.published = true
        and p.availability in ('catalogue','available','reserved')
    )
  );

drop policy if exists "customer_enquiries_member_select" on public.customer_enquiries;
create policy "customer_enquiries_member_select"
  on public.customer_enquiries for select to authenticated
  using (
    exists (
      select 1
      from public.customer_publications p
      join public.workspace_members m on m.workspace_id = p.workspace_id
      where p.id = customer_enquiries.publication_id
        and m.user_id = (select auth.uid())
    )
  );

drop policy if exists "customer_enquiries_editor_update" on public.customer_enquiries;
create policy "customer_enquiries_editor_update"
  on public.customer_enquiries for update to authenticated
  using (
    exists (
      select 1
      from public.customer_publications p
      join public.workspace_members m on m.workspace_id = p.workspace_id
      where p.id = customer_enquiries.publication_id
        and m.user_id = (select auth.uid())
        and m.role = any (array['owner'::text, 'editor'::text])
    )
  )
  with check (
    exists (
      select 1
      from public.customer_publications p
      join public.workspace_members m on m.workspace_id = p.workspace_id
      where p.id = customer_enquiries.publication_id
        and m.user_id = (select auth.uid())
        and m.role = any (array['owner'::text, 'editor'::text])
    )
  );
