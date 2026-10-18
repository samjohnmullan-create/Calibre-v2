alter table public.customer_enquiries
  add column if not exists notification_sent_at timestamptz,
  add column if not exists notification_error text;

create index if not exists idx_customer_enquiries_status_created
  on public.customer_enquiries (status, created_at desc);

create table if not exists public.customer_notification_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  email_enabled boolean not null default true,
  email_to text not null check (char_length(email_to) between 3 and 320),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.customer_notification_settings (workspace_id, email_enabled, email_to)
select w.id, true, u.email
from public.workspaces w
join auth.users u on u.id = w.owner_id
where u.email is not null and char_length(u.email) between 3 and 320
on conflict (workspace_id) do nothing;

alter table public.customer_notification_settings enable row level security;

drop policy if exists customer_notification_settings_member_select on public.customer_notification_settings;
create policy customer_notification_settings_member_select
on public.customer_notification_settings
for select
to authenticated
using (
  exists (
    select 1 from public.workspace_members m
    where m.workspace_id = customer_notification_settings.workspace_id
      and m.user_id = (select auth.uid())
  )
);

drop policy if exists customer_notification_settings_editor_update on public.customer_notification_settings;
create policy customer_notification_settings_editor_update
on public.customer_notification_settings
for update
to authenticated
using (
  exists (
    select 1 from public.workspace_members m
    where m.workspace_id = customer_notification_settings.workspace_id
      and m.user_id = (select auth.uid())
      and m.role = any (array['owner'::text, 'editor'::text])
  )
)
with check (
  exists (
    select 1 from public.workspace_members m
    where m.workspace_id = customer_notification_settings.workspace_id
      and m.user_id = (select auth.uid())
      and m.role = any (array['owner'::text, 'editor'::text])
  )
);

create or replace function public.get_calibre_server_secret(p_name text)
returns text
language sql
security definer
set search_path = public, vault
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = p_name
  order by updated_at desc
  limit 1;
$$;

revoke all on function public.get_calibre_server_secret(text) from public;
revoke all on function public.get_calibre_server_secret(text) from anon;
revoke all on function public.get_calibre_server_secret(text) from authenticated;
grant execute on function public.get_calibre_server_secret(text) to service_role;

alter table public.customer_enquiries replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.customer_enquiries;
exception
  when duplicate_object then null;
end $$;
