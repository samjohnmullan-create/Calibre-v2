create table if not exists public.work_part_needs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  work_record_id uuid not null references public.work_records(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  part_type text not null default '',
  description text not null default '',
  status text not null default 'open' check (status in ('open','reserved','fulfilled','cancelled')),
  created_by uuid null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists work_part_needs_work_record_idx on public.work_part_needs(work_record_id);
create index if not exists work_part_needs_item_idx on public.work_part_needs(item_id);
create index if not exists work_part_needs_status_idx on public.work_part_needs(status);

alter table public.work_part_needs enable row level security;

drop policy if exists work_part_needs_read on public.work_part_needs;
create policy work_part_needs_read on public.work_part_needs for select to authenticated using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = work_part_needs.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists work_part_needs_manage on public.work_part_needs;
create policy work_part_needs_manage on public.work_part_needs for all to authenticated using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = work_part_needs.workspace_id
      and wm.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = work_part_needs.workspace_id
      and wm.user_id = auth.uid()
  )
);

grant select, insert, update, delete on public.work_part_needs to authenticated;
