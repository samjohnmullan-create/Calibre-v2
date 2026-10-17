-- Versioned Work templates and per-job checklist snapshots.
-- A Work checklist is copied from a template so completed jobs never change when templates evolve.

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

insert into public.work_templates (workspace_id, slug, name, work_type, version, description, is_active)
select w.id, 'mechanical-service', 'Mechanical service', 'service', 1,
       'Standard mechanical watch service checklist. Copied into each Work record so completed jobs never change when the template evolves.', true
from public.workspaces w
on conflict (workspace_id, slug, version) do nothing;

insert into public.work_template_steps (workspace_id, template_id, step_key, section_key, label, description, sequence, required)
select t.workspace_id, t.id, s.step_key, s.section_key, s.label, s.description, s.sequence, s.required
from public.work_templates t
cross join (values
  ('intake','intake','Intake & diagnosis','Record presented condition, symptoms, crown/winding/setting behaviour and visible damage before work begins.',10,true),
  ('pre_service_timing','intake','Pre-service timing','Record a baseline timing run where the movement condition allows it.',20,false),
  ('demagnetise_check','intake','Demagnetise / check','Check for magnetism and demagnetise when appropriate.',30,false),
  ('movement_removal','disassembly','Case & movement removal','Remove movement safely and record relevant case/casing observations.',40,true),
  ('strip_down','disassembly','Strip-down','Disassemble movement methodically, keeping unusual findings with the job record.',50,true),
  ('inspection','inspection','Component inspection','Inspect train, pivots, jewels, barrel, escapement, balance, keyless works and damaged/missing parts.',60,true),
  ('cleaning','cleaning','Cleaning','Clean movement components and record exceptions or parts kept out of normal cleaning.',70,true),
  ('barrel_mainspring','assembly','Barrel & mainspring','Inspect, prepare and assemble barrel and mainspring; confirm arbor and bridle/hook engagement as applicable.',80,true),
  ('train_test','assembly','Train test','Assemble and verify train freedom/endshake before progressing.',90,true),
  ('keyless_winding','assembly','Keyless & winding works','Assemble and verify winding, setting and keyless operation.',100,true),
  ('escapement','assembly','Escapement','Inspect/assemble escapement and verify functional lock/drop where appropriate.',110,true),
  ('balance','assembly','Balance','Install and verify balance freedom, endshake and stable running.',120,true),
  ('lubrication_final_assembly','assembly','Lubrication & final assembly','Complete lubrication and remaining assembly using the job-specific lubrication plan.',130,true),
  ('regulation','regulation','Regulation','Regulate rate/beat as appropriate and record timing evidence.',140,true),
  ('casing','regulation','Casing','Case the movement, verify hand clearance, crown operation and final presentation.',150,true),
  ('final_qc','qc','Final QC','Complete functional checks, timing review, cleanliness/presentation check and confirm no unresolved blockers remain.',160,true)
) as s(step_key,section_key,label,description,sequence,required)
where t.slug='mechanical-service' and t.version=1
on conflict (template_id, step_key) do nothing;

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

create or replace function public.start_work(
  p_workspace_id uuid,
  p_item_id uuid,
  p_type text default 'service',
  p_title text default null,
  p_template_id uuid default null
)
returns public.work_records
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_work public.work_records;
  v_number bigint;
  v_template_id uuid;
  v_title text;
begin
  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
      and m.role = any(array['owner','editor']::text[])
  ) then
    raise exception 'Not authorised for this workspace';
  end if;

  if not exists (select 1 from public.items where workspace_id=p_workspace_id and id=p_item_id) then
    raise exception 'Item not found';
  end if;

  if p_type <> all(array['inspection','service','repair','restoration','cleaning','assessment','photography','listing_prep','qc','other']::text[]) then
    raise exception 'Unsupported Work type';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':work-number', 0));
  select coalesce(max(work_number),0)+1 into v_number from public.work_records where workspace_id=p_workspace_id;

  v_template_id := p_template_id;
  if v_template_id is null then
    select id into v_template_id from public.work_templates
    where workspace_id=p_workspace_id and work_type=p_type and is_active
    order by version desc limit 1;
  end if;
  if v_template_id is not null and not exists (select 1 from public.work_templates where workspace_id=p_workspace_id and id=v_template_id) then
    raise exception 'Template not found in this workspace';
  end if;

  select coalesce(nullif(btrim(p_title),''), wt.name, initcap(replace(p_type,'_',' '))) into v_title
  from (select 1) x
  left join public.work_templates wt on wt.id=v_template_id;

  insert into public.work_records (
    workspace_id,item_id,work_number,type,title,status,template_id
  ) values (
    p_workspace_id,p_item_id,v_number,p_type,v_title,'queued',v_template_id
  ) returning * into v_work;

  if v_template_id is not null then
    perform public.initialize_work_checklist(p_workspace_id, v_work.id, v_template_id);
  end if;

  insert into public.work_events(workspace_id,work_id,item_id,event_type,summary,details)
  values (p_workspace_id,v_work.id,p_item_id,'work_started','Work record created',jsonb_build_object('work_type',p_type,'template_id',v_template_id));

  return v_work;
end;
$function$;

revoke all on function public.initialize_work_checklist(uuid,uuid,uuid) from public, anon;
revoke all on function public.start_work(uuid,uuid,text,text,uuid) from public, anon;
grant execute on function public.initialize_work_checklist(uuid,uuid,uuid) to authenticated;
grant execute on function public.start_work(uuid,uuid,text,text,uuid) to authenticated;
