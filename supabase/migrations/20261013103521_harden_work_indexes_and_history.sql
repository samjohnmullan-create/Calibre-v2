-- REPLAY RECOVERY NOTE
-- Production already contained the versioned Work template/checklist schema before
-- migration 20261013103521 was recorded, but that DDL was not present in
-- supabase_migrations.schema_migrations. The exact originally-recorded migration is
-- preserved at supabase/migration-history/live-applied/20261013103521_harden_work_indexes_and_history.sql.
--
-- This prelude reconstructs only the untracked schema, privileges, RLS policies,
-- initialize_work_checklist function and completion-gate trigger that subsequent
-- recorded migrations demonstrably depend on. Production already has these objects;
-- version 20261013103521 is already marked applied there, so this repair exists to
-- make clean local/disposable replays deterministic without inventing a new remote
-- migration version.

create table if not exists public.work_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  slug text not null,
  name text not null,
  work_type text not null,
  version integer not null default 1 check (version >= 1),
  description text not null default '',
  is_active boolean not null default true,
  created_by uuid null references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_templates_name_check check (btrim(name) <> ''),
  constraint work_templates_slug_check check (btrim(slug) <> ''),
  constraint work_templates_type_check check (work_type = any (array['inspection','service','repair','restoration','cleaning','assessment','photography','listing_prep','qc','other']::text[])),
  constraint work_templates_workspace_slug_version_key unique (workspace_id, slug, version),
  constraint work_templates_workspace_id_id_key unique (workspace_id, id)
);

create unique index if not exists work_templates_one_active_version_idx
  on public.work_templates(workspace_id, slug)
  where is_active;
create index if not exists work_templates_workspace_type_idx
  on public.work_templates(workspace_id, work_type, is_active);

create table if not exists public.work_template_steps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  template_id uuid not null,
  step_key text not null,
  section_key text not null default 'general',
  label text not null,
  description text not null default '',
  sequence integer not null check (sequence >= 0),
  required boolean not null default true,
  created_at timestamptz not null default now(),
  constraint work_template_steps_label_check check (btrim(label) <> ''),
  constraint work_template_steps_step_key_check check (btrim(step_key) <> ''),
  constraint work_template_steps_template_fkey foreign key (workspace_id, template_id) references public.work_templates(workspace_id, id) on delete cascade,
  constraint work_template_steps_template_step_key_key unique (template_id, step_key),
  constraint work_template_steps_template_sequence_key unique (template_id, sequence),
  constraint work_template_steps_workspace_id_id_key unique (workspace_id, id)
);
create index if not exists work_template_steps_template_order_idx
  on public.work_template_steps(template_id, sequence);

alter table public.work_records
  add column if not exists template_id uuid null references public.work_templates(id) on delete set null;
create index if not exists work_records_workspace_item_status_idx
  on public.work_records(workspace_id, item_id, status, work_number desc);

create table if not exists public.work_checklist_steps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  work_id uuid not null,
  item_id uuid not null,
  template_id uuid null references public.work_templates(id) on delete set null,
  template_step_id uuid null references public.work_template_steps(id) on delete set null,
  step_key text not null,
  section_key text not null default 'general',
  label text not null,
  description text not null default '',
  sequence integer not null check (sequence >= 0),
  required boolean not null default true,
  status text not null default 'not_started' check (status = any (array['not_started','in_progress','done','na','blocked']::text[])),
  notes text not null default '',
  blocked_reason text not null default '',
  started_at timestamptz null,
  completed_at timestamptz null,
  created_by uuid null references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_checklist_steps_work_fkey foreign key (workspace_id, work_id) references public.work_records(workspace_id, id) on delete cascade,
  constraint work_checklist_steps_item_fkey foreign key (workspace_id, item_id) references public.items(workspace_id, id) on delete cascade,
  constraint work_checklist_steps_work_sequence_key unique (work_id, sequence),
  constraint work_checklist_steps_work_step_key_key unique (work_id, step_key)
);
create index if not exists work_checklist_steps_work_order_idx
  on public.work_checklist_steps(work_id, sequence);
create index if not exists work_checklist_steps_workspace_status_idx
  on public.work_checklist_steps(workspace_id, status, work_id);

alter table public.work_templates enable row level security;
alter table public.work_template_steps enable row level security;
alter table public.work_checklist_steps enable row level security;

revoke all on public.work_templates from anon;
revoke all on public.work_template_steps from anon;
revoke all on public.work_checklist_steps from anon;
grant select, insert, update, delete on public.work_templates to authenticated;
grant select, insert, update, delete on public.work_template_steps to authenticated;
grant select, insert, update, delete on public.work_checklist_steps to authenticated;

create policy work_templates_select on public.work_templates for select to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = work_templates.workspace_id and m.user_id = (select auth.uid())));
create policy work_templates_insert on public.work_templates for insert to authenticated
with check (exists (select 1 from public.workspace_members m where m.workspace_id = work_templates.workspace_id and m.user_id = (select auth.uid()) and m.role = any(array['owner','editor']::text[])));
create policy work_templates_update on public.work_templates for update to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = work_templates.workspace_id and m.user_id = (select auth.uid()) and m.role = any(array['owner','editor']::text[])))
with check (exists (select 1 from public.workspace_members m where m.workspace_id = work_templates.workspace_id and m.user_id = (select auth.uid()) and m.role = any(array['owner','editor']::text[])));
create policy work_templates_delete on public.work_templates for delete to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = work_templates.workspace_id and m.user_id = (select auth.uid()) and m.role = any(array['owner','editor']::text[])));

create policy work_template_steps_select on public.work_template_steps for select to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = work_template_steps.workspace_id and m.user_id = (select auth.uid())));
create policy work_template_steps_insert on public.work_template_steps for insert to authenticated
with check (exists (select 1 from public.workspace_members m where m.workspace_id = work_template_steps.workspace_id and m.user_id = (select auth.uid()) and m.role = any(array['owner','editor']::text[])));
create policy work_template_steps_update on public.work_template_steps for update to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = work_template_steps.workspace_id and m.user_id = (select auth.uid()) and m.role = any(array['owner','editor']::text[])))
with check (exists (select 1 from public.workspace_members m where m.workspace_id = work_template_steps.workspace_id and m.user_id = (select auth.uid()) and m.role = any(array['owner','editor']::text[])));
create policy work_template_steps_delete on public.work_template_steps for delete to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = work_template_steps.workspace_id and m.user_id = (select auth.uid()) and m.role = any(array['owner','editor']::text[])));

create policy work_checklist_steps_select on public.work_checklist_steps for select to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = work_checklist_steps.workspace_id and m.user_id = (select auth.uid())));
create policy work_checklist_steps_insert on public.work_checklist_steps for insert to authenticated
with check (exists (select 1 from public.workspace_members m where m.workspace_id = work_checklist_steps.workspace_id and m.user_id = (select auth.uid()) and m.role = any(array['owner','editor']::text[])));
create policy work_checklist_steps_update on public.work_checklist_steps for update to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = work_checklist_steps.workspace_id and m.user_id = (select auth.uid()) and m.role = any(array['owner','editor']::text[])))
with check (exists (select 1 from public.workspace_members m where m.workspace_id = work_checklist_steps.workspace_id and m.user_id = (select auth.uid()) and m.role = any(array['owner','editor']::text[])));
create policy work_checklist_steps_delete on public.work_checklist_steps for delete to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = work_checklist_steps.workspace_id and m.user_id = (select auth.uid()) and m.role = any(array['owner','editor']::text[])));

create or replace function public.initialize_work_checklist(
  p_workspace_id uuid,
  p_work_id uuid,
  p_template_id uuid default null
)
returns integer
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_work public.work_records%rowtype;
  v_template_id uuid;
  v_count integer := 0;
begin
  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
      and m.role = any(array['owner','editor']::text[])
  ) then
    raise exception 'Not authorised for this workspace';
  end if;

  select * into v_work from public.work_records
  where workspace_id = p_workspace_id and id = p_work_id;
  if not found then raise exception 'Work record not found'; end if;

  if exists (select 1 from public.work_checklist_steps where workspace_id=p_workspace_id and work_id=p_work_id) then
    return 0;
  end if;

  v_template_id := p_template_id;
  if v_template_id is null then
    select id into v_template_id from public.work_templates
    where workspace_id=p_workspace_id and work_type=v_work.type and is_active
    order by version desc limit 1;
  end if;

  if v_template_id is null then raise exception 'No active Work template is available for this Work type'; end if;
  if not exists (select 1 from public.work_templates where id=v_template_id and workspace_id=p_workspace_id) then
    raise exception 'Template not found in this workspace';
  end if;

  update public.work_records set template_id=v_template_id, updated_at=now()
  where workspace_id=p_workspace_id and id=p_work_id;

  insert into public.work_checklist_steps (
    workspace_id, work_id, item_id, template_id, template_step_id,
    step_key, section_key, label, description, sequence, required
  )
  select p_workspace_id, v_work.id, v_work.item_id, v_template_id, s.id,
         s.step_key, s.section_key, s.label, s.description, s.sequence, s.required
  from public.work_template_steps s
  where s.workspace_id=p_workspace_id and s.template_id=v_template_id
  order by s.sequence;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke all on function public.initialize_work_checklist(uuid,uuid,uuid) from public, anon;
grant execute on function public.initialize_work_checklist(uuid,uuid,uuid) to authenticated;

create or replace function public.enforce_work_completion_gate()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if new.status = 'on_bench' and new.started_at is null then
    new.started_at := now();
  end if;

  if new.status = 'complete' and old.status is distinct from 'complete' then
    if exists (
      select 1 from public.work_checklist_steps s
      where s.workspace_id = new.workspace_id
        and s.work_id = new.id
    ) and exists (
      select 1 from public.work_checklist_steps s
      where s.workspace_id = new.workspace_id
        and s.work_id = new.id
        and s.required
        and s.status not in ('done','na')
    ) then
      raise exception 'Complete all required checklist steps before closing this Work record';
    end if;
    new.completed_at := coalesce(new.completed_at, now());
  elsif new.status <> 'complete' then
    new.completed_at := null;
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists work_records_completion_gate on public.work_records;
create trigger work_records_completion_gate
before update on public.work_records
for each row execute function public.enforce_work_completion_gate();

-- ORIGINAL LIVE MIGRATION 20261013103521_harden_work_indexes_and_history
create index if not exists work_records_template_id_idx on public.work_records(template_id);
create index if not exists work_templates_created_by_idx on public.work_templates(created_by);
create index if not exists work_template_steps_workspace_template_idx on public.work_template_steps(workspace_id, template_id);
create index if not exists work_checklist_steps_workspace_work_idx on public.work_checklist_steps(workspace_id, work_id);
create index if not exists work_checklist_steps_workspace_item_idx on public.work_checklist_steps(workspace_id, item_id);
create index if not exists work_checklist_steps_template_id_idx on public.work_checklist_steps(template_id);
create index if not exists work_checklist_steps_template_step_id_idx on public.work_checklist_steps(template_step_id);

create or replace function public.log_work_status_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.work_events(workspace_id, work_id, item_id, event_type, summary, details, actor_id, actor_type)
    values (
      new.workspace_id,
      new.id,
      new.item_id,
      'status_changed',
      'Work moved from ' || replace(old.status, '_', ' ') || ' to ' || replace(new.status, '_', ' '),
      jsonb_build_object('from', old.status, 'to', new.status),
      auth.uid(),
      case when auth.uid() is null then 'system' else 'user' end
    );
  end if;
  return new;
end;
$$;

drop trigger if exists work_records_log_status_change on public.work_records;
create trigger work_records_log_status_change
after update of status on public.work_records
for each row
when (old.status is distinct from new.status)
execute function public.log_work_status_change();

create or replace function public.log_work_checklist_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.work_events(workspace_id, work_id, item_id, event_type, summary, details, actor_id, actor_type)
    values (
      new.workspace_id,
      new.work_id,
      new.item_id,
      'checklist_step',
      new.label || ' → ' || replace(new.status, '_', ' '),
      jsonb_build_object('step_id', new.id, 'step_key', new.step_key, 'from', old.status, 'to', new.status),
      auth.uid(),
      case when auth.uid() is null then 'system' else 'user' end
    );
  end if;
  return new;
end;
$$;

drop trigger if exists work_checklist_steps_log_change on public.work_checklist_steps;
create trigger work_checklist_steps_log_change
after update of status on public.work_checklist_steps
for each row
when (old.status is distinct from new.status)
execute function public.log_work_checklist_change();
