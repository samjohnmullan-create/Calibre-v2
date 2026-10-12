create or replace function public.can_manage_knowledge()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.workspace_members wm
      where wm.user_id = auth.uid()
        and wm.role = 'owner'
    );
$$;

revoke all on function public.can_manage_knowledge() from public;
grant execute on function public.can_manage_knowledge() to authenticated;

create table if not exists public.knowledge_movement_sources (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid not null references public.knowledge_movements(id) on delete cascade,
  source_id uuid not null references public.knowledge_sources(id) on delete cascade,
  evidence_class text not null default 'documented' check (evidence_class in ('manufacturer','documented','catalogue','inferred')),
  reference_text text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  unique (movement_id, source_id)
);

alter table public.knowledge_movement_sources enable row level security;

drop policy if exists knowledge_movement_sources_read on public.knowledge_movement_sources;
create policy knowledge_movement_sources_read
on public.knowledge_movement_sources for select
using (true);

drop policy if exists knowledge_movement_sources_manage on public.knowledge_movement_sources;
create policy knowledge_movement_sources_manage
on public.knowledge_movement_sources for all
to authenticated
using (public.can_manage_knowledge())
with check (public.can_manage_knowledge());

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='knowledge_sources' and policyname='knowledge_sources_manage') then
    create policy knowledge_sources_manage on public.knowledge_sources for all to authenticated using (public.can_manage_knowledge()) with check (public.can_manage_knowledge());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='knowledge_movements' and policyname='knowledge_movements_manage') then
    create policy knowledge_movements_manage on public.knowledge_movements for all to authenticated using (public.can_manage_knowledge()) with check (public.can_manage_knowledge());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='knowledge_part_refs' and policyname='knowledge_part_refs_manage') then
    create policy knowledge_part_refs_manage on public.knowledge_part_refs for all to authenticated using (public.can_manage_knowledge()) with check (public.can_manage_knowledge());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='knowledge_part_applications' and policyname='knowledge_part_applications_manage') then
    create policy knowledge_part_applications_manage on public.knowledge_part_applications for all to authenticated using (public.can_manage_knowledge()) with check (public.can_manage_knowledge());
  end if;
end $$;

grant select on public.knowledge_movement_sources to anon, authenticated;
grant insert, update, delete on public.knowledge_movement_sources to authenticated;
