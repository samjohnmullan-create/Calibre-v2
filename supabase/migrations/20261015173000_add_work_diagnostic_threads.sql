-- Persistent diagnostic hypotheses and checks for Bench Guided Job.
-- Findings are observations; hypotheses remain possible until the watchmaker confirms them.

create table if not exists public.work_diagnostic_hypotheses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  work_id uuid not null,
  item_id uuid not null,
  finding_id uuid null references public.work_findings(id) on delete cascade,
  title text not null,
  rationale text not null default '',
  confidence text not null default 'possible' check (confidence = any (array['strong','probable','possible','unknown']::text[])),
  status text not null default 'possible' check (status = any (array['possible','confirmed','ruled_out']::text[])),
  source_kind text not null default 'calibre_rule' check (source_kind = any (array['calibre_rule','knowledge','reference','research','workshop_history','manual']::text[])),
  source_ref text not null default '',
  created_by uuid null references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_diagnostic_hypotheses_work_fkey foreign key (workspace_id, work_id) references public.work_records(workspace_id, id) on delete cascade,
  constraint work_diagnostic_hypotheses_item_fkey foreign key (workspace_id, item_id) references public.items(workspace_id, id) on delete cascade,
  constraint work_diagnostic_hypotheses_title_check check (btrim(title) <> '')
);

create table if not exists public.work_diagnostic_checks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  work_id uuid not null,
  item_id uuid not null,
  hypothesis_id uuid not null references public.work_diagnostic_hypotheses(id) on delete cascade,
  label text not null,
  instructions text not null default '',
  sequence integer not null default 0 check (sequence >= 0),
  status text not null default 'suggested' check (status = any (array['suggested','approved','complete','not_applicable']::text[])),
  result text not null default '',
  source_ref text not null default '',
  created_by uuid null references auth.users(id) on delete set null default auth.uid(),
  completed_by uuid null references auth.users(id) on delete set null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_diagnostic_checks_work_fkey foreign key (workspace_id, work_id) references public.work_records(workspace_id, id) on delete cascade,
  constraint work_diagnostic_checks_item_fkey foreign key (workspace_id, item_id) references public.items(workspace_id, id) on delete cascade,
  constraint work_diagnostic_checks_label_check check (btrim(label) <> '')
);

create index if not exists work_diagnostic_hypotheses_work_idx on public.work_diagnostic_hypotheses(workspace_id, work_id, status, created_at desc);
create index if not exists work_diagnostic_hypotheses_finding_idx on public.work_diagnostic_hypotheses(finding_id, status);
create index if not exists work_diagnostic_hypotheses_item_idx on public.work_diagnostic_hypotheses(workspace_id, item_id);
create index if not exists work_diagnostic_hypotheses_created_by_idx on public.work_diagnostic_hypotheses(created_by);
create index if not exists work_diagnostic_checks_work_idx on public.work_diagnostic_checks(workspace_id, work_id, status, sequence);
create index if not exists work_diagnostic_checks_hypothesis_idx on public.work_diagnostic_checks(hypothesis_id, sequence);
create index if not exists work_diagnostic_checks_item_idx on public.work_diagnostic_checks(workspace_id, item_id);
create index if not exists work_diagnostic_checks_created_by_idx on public.work_diagnostic_checks(created_by);
create index if not exists work_diagnostic_checks_completed_by_idx on public.work_diagnostic_checks(completed_by);

alter table public.work_diagnostic_hypotheses enable row level security;
alter table public.work_diagnostic_checks enable row level security;

revoke all on public.work_diagnostic_hypotheses from anon;
revoke all on public.work_diagnostic_checks from anon;
grant select, insert, update on public.work_diagnostic_hypotheses to authenticated;
grant select, insert, update on public.work_diagnostic_checks to authenticated;

create policy work_diagnostic_hypotheses_select on public.work_diagnostic_hypotheses for select to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = work_diagnostic_hypotheses.workspace_id and m.user_id = (select auth.uid())));
create policy work_diagnostic_hypotheses_insert on public.work_diagnostic_hypotheses for insert to authenticated
with check (exists (select 1 from public.workspace_members m where m.workspace_id = work_diagnostic_hypotheses.workspace_id and m.user_id = (select auth.uid()) and m.role = any(array['owner','editor']::text[])));
create policy work_diagnostic_hypotheses_update on public.work_diagnostic_hypotheses for update to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = work_diagnostic_hypotheses.workspace_id and m.user_id = (select auth.uid()) and m.role = any(array['owner','editor']::text[])))
with check (exists (select 1 from public.workspace_members m where m.workspace_id = work_diagnostic_hypotheses.workspace_id and m.user_id = (select auth.uid()) and m.role = any(array['owner','editor']::text[])));

create policy work_diagnostic_checks_select on public.work_diagnostic_checks for select to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = work_diagnostic_checks.workspace_id and m.user_id = (select auth.uid())));
create policy work_diagnostic_checks_insert on public.work_diagnostic_checks for insert to authenticated
with check (exists (select 1 from public.workspace_members m where m.workspace_id = work_diagnostic_checks.workspace_id and m.user_id = (select auth.uid()) and m.role = any(array['owner','editor']::text[])));
create policy work_diagnostic_checks_update on public.work_diagnostic_checks for update to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = work_diagnostic_checks.workspace_id and m.user_id = (select auth.uid()) and m.role = any(array['owner','editor']::text[])))
with check (exists (select 1 from public.workspace_members m where m.workspace_id = work_diagnostic_checks.workspace_id and m.user_id = (select auth.uid()) and m.role = any(array['owner','editor']::text[])));
