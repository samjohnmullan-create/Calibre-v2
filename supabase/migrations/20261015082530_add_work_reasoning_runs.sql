create table public.work_reasoning_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  work_id uuid not null,
  item_id uuid not null,
  model text not null default '',
  status text not null default 'complete' check (status = any(array['complete','failed']::text[])),
  context_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(context_snapshot) = 'object'),
  response_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(response_payload) = 'object'),
  summary text not null default '',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint work_reasoning_runs_work_fkey foreign key (workspace_id, work_id)
    references public.work_records(workspace_id, id) on delete cascade,
  constraint work_reasoning_runs_item_fkey foreign key (workspace_id, item_id)
    references public.items(workspace_id, id) on delete cascade
);

create index work_reasoning_runs_work_idx on public.work_reasoning_runs(workspace_id, work_id, created_at desc);
create index work_reasoning_runs_workspace_item_idx on public.work_reasoning_runs(workspace_id, item_id, created_at desc);
create index work_reasoning_runs_created_by_idx on public.work_reasoning_runs(created_by) where created_by is not null;

alter table public.work_reasoning_runs enable row level security;
revoke all on public.work_reasoning_runs from anon, authenticated;
grant select, insert on public.work_reasoning_runs to authenticated;

create policy work_reasoning_runs_select on public.work_reasoning_runs
for select to authenticated
using (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = work_reasoning_runs.workspace_id
    and m.user_id = (select auth.uid())
));

create policy work_reasoning_runs_insert on public.work_reasoning_runs
for insert to authenticated
with check (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = work_reasoning_runs.workspace_id
    and m.user_id = (select auth.uid())
    and m.role = any(array['owner','editor']::text[])
));
