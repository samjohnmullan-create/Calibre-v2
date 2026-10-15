-- Workshop induction -> findings -> job plan -> procedure checklist.
-- New Work starts with an evidence-backed induction instead of assuming a procedure.

alter table public.work_records
  add column if not exists induction_status text not null default 'pending',
  add column if not exists induction_version integer not null default 1,
  add column if not exists induction_started_at timestamptz null,
  add column if not exists induction_completed_at timestamptz null,
  add column if not exists job_plan_status text not null default 'pending';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'work_records_induction_status_check') then
    alter table public.work_records add constraint work_records_induction_status_check
      check (induction_status = any (array['pending','in_progress','complete','legacy_skipped']::text[]));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'work_records_induction_version_check') then
    alter table public.work_records add constraint work_records_induction_version_check check (induction_version >= 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'work_records_job_plan_status_check') then
    alter table public.work_records add constraint work_records_job_plan_status_check
      check (job_plan_status = any (array['pending','ready','applied']::text[]));
  end if;
end $$;

-- Existing jobs with a real checklist remain valid and are not forced through a new induction.
-- Existing active jobs without a checklist become induction candidates.
update public.work_records wr
set
  induction_status = case
    when wr.status in ('complete','cancelled') then 'legacy_skipped'
    when exists (
      select 1 from public.work_checklist_steps s
      where s.workspace_id = wr.workspace_id and s.work_id = wr.id
    ) then 'legacy_skipped'
    else 'pending'
  end,
  job_plan_status = case
    when exists (
      select 1 from public.work_checklist_steps s
      where s.workspace_id = wr.workspace_id and s.work_id = wr.id
    ) then 'applied'
    else 'pending'
  end;

create table if not exists public.work_induction_checks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  work_id uuid not null,
  item_id uuid not null,
  induction_version integer not null default 1 check (induction_version >= 1),
  check_key text not null,
  category text not null default 'general',
  label text not null,
  description text not null default '',
  sequence integer not null check (sequence >= 0),
  required boolean not null default true,
  status text not null default 'pending' check (status = any (array['pending','pass','problem','na']::text[])),
  notes text not null default '',
  created_by uuid null references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_induction_checks_work_fkey foreign key (workspace_id, work_id) references public.work_records(workspace_id, id) on delete cascade,
  constraint work_induction_checks_item_fkey foreign key (workspace_id, item_id) references public.items(workspace_id, id) on delete cascade,
  constraint work_induction_checks_work_key_key unique (work_id, check_key),
  constraint work_induction_checks_work_sequence_key unique (work_id, sequence),
  constraint work_induction_checks_label_check check (btrim(label) <> '')
);
create index if not exists work_induction_checks_work_status_idx on public.work_induction_checks(work_id, status, sequence);
create index if not exists work_induction_checks_workspace_item_idx on public.work_induction_checks(workspace_id, item_id);

create table if not exists public.work_findings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  work_id uuid not null,
  item_id uuid not null,
  induction_check_id uuid null references public.work_induction_checks(id) on delete set null,
  finding_type text not null default 'observation' check (finding_type = any (array['observation','fault','damage','performance','cosmetic','other']::text[])),
  severity text not null default 'moderate' check (severity = any (array['info','minor','moderate','major','critical']::text[])),
  title text not null,
  details text not null default '',
  status text not null default 'open' check (status = any (array['open','resolved','accepted','not_actioned']::text[])),
  created_by uuid null references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_findings_work_fkey foreign key (workspace_id, work_id) references public.work_records(workspace_id, id) on delete cascade,
  constraint work_findings_item_fkey foreign key (workspace_id, item_id) references public.items(workspace_id, id) on delete cascade,
  constraint work_findings_title_check check (btrim(title) <> '')
);
create unique index if not exists work_findings_induction_check_unique on public.work_findings(induction_check_id) where induction_check_id is not null;
create index if not exists work_findings_work_status_idx on public.work_findings(work_id, status, created_at desc);

create table if not exists public.work_plan_actions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  work_id uuid not null,
  item_id uuid not null,
  action_key text not null,
  label text not null,
  sequence integer not null check (sequence >= 0),
  procedure_template_id uuid null references public.work_templates(id) on delete set null,
  status text not null default 'planned' check (status = any (array['planned','in_progress','complete','cancelled']::text[])),
  notes text not null default '',
  created_by uuid null references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_plan_actions_work_fkey foreign key (workspace_id, work_id) references public.work_records(workspace_id, id) on delete cascade,
  constraint work_plan_actions_item_fkey foreign key (workspace_id, item_id) references public.items(workspace_id, id) on delete cascade,
  constraint work_plan_actions_work_action_key_key unique (work_id, action_key),
  constraint work_plan_actions_label_check check (btrim(label) <> '')
);
create index if not exists work_plan_actions_work_sequence_idx on public.work_plan_actions(work_id, sequence);

alter table public.work_checklist_steps
  add column if not exists phase text not null default 'procedure',
  add column if not exists plan_action_id uuid null references public.work_plan_actions(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'work_checklist_steps_phase_check') then
    alter table public.work_checklist_steps add constraint work_checklist_steps_phase_check
      check (phase = any (array['procedure','final_qc']::text[]));
  end if;
end $$;
create index if not exists work_checklist_steps_plan_action_idx on public.work_checklist_steps(plan_action_id, sequence);

alter table public.work_induction_checks enable row level security;
alter table public.work_findings enable row level security;
alter table public.work_plan_actions enable row level security;

revoke all on public.work_induction_checks from anon;
revoke all on public.work_findings from anon;
revoke all on public.work_plan_actions from anon;
grant select, insert, update on public.work_induction_checks to authenticated;
grant select, insert, update on public.work_findings to authenticated;
grant select, insert, update on public.work_plan_actions to authenticated;

create policy work_induction_checks_select on public.work_induction_checks for select to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = work_induction_checks.workspace_id and m.user_id = (select auth.uid())));
create policy work_induction_checks_insert on public.work_induction_checks for insert to authenticated
with check (exists (select 1 from public.workspace_members m where m.workspace_id = work_induction_checks.workspace_id and m.user_id = (select auth.uid()) and m.role = any(array['owner','editor']::text[])));
create policy work_induction_checks_update on public.work_induction_checks for update to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = work_induction_checks.workspace_id and m.user_id = (select auth.uid()) and m.role = any(array['owner','editor']::text[])))
with check (exists (select 1 from public.workspace_members m where m.workspace_id = work_induction_checks.workspace_id and m.user_id = (select auth.uid()) and m.role = any(array['owner','editor']::text[])));

create policy work_findings_select on public.work_findings for select to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = work_findings.workspace_id and m.user_id = (select auth.uid())));
create policy work_findings_insert on public.work_findings for insert to authenticated
with check (exists (select 1 from public.workspace_members m where m.workspace_id = work_findings.workspace_id and m.user_id = (select auth.uid()) and m.role = any(array['owner','editor']::text[])));
create policy work_findings_update on public.work_findings for update to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = work_findings.workspace_id and m.user_id = (select auth.uid()) and m.role = any(array['owner','editor']::text[])))
with check (exists (select 1 from public.workspace_members m where m.workspace_id = work_findings.workspace_id and m.user_id = (select auth.uid()) and m.role = any(array['owner','editor']::text[])));

create policy work_plan_actions_select on public.work_plan_actions for select to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = work_plan_actions.workspace_id and m.user_id = (select auth.uid())));
create policy work_plan_actions_insert on public.work_plan_actions for insert to authenticated
with check (exists (select 1 from public.workspace_members m where m.workspace_id = work_plan_actions.workspace_id and m.user_id = (select auth.uid()) and m.role = any(array['owner','editor']::text[])));
create policy work_plan_actions_update on public.work_plan_actions for update to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = work_plan_actions.workspace_id and m.user_id = (select auth.uid()) and m.role = any(array['owner','editor']::text[])))
with check (exists (select 1 from public.workspace_members m where m.workspace_id = work_plan_actions.workspace_id and m.user_id = (select auth.uid()) and m.role = any(array['owner','editor']::text[])));

create or replace function public.initialize_work_induction(
  p_workspace_id uuid,
  p_work_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_work public.work_records%rowtype;
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

  insert into public.work_induction_checks (
    workspace_id, work_id, item_id, induction_version,
    check_key, category, label, description, sequence, required
  )
  select p_workspace_id, v_work.id, v_work.item_id, v_work.induction_version,
         c.check_key, c.category, c.label, c.description, c.sequence, c.required
  from (values
    ('identity','intake','Confirm identity','Confirm the Item and any known maker/model/calibre details before work begins.',10,true),
    ('condition_photos','evidence','Initial condition photos','Capture the watch as received before cleaning, opening or repair work.',20,true),
    ('running','function','Running condition','Does the watch run when presented or after a gentle appropriate wind?',30,true),
    ('winding','function','Winding','Check winding feel and function without forcing the mechanism.',40,true),
    ('setting','function','Setting','Check hand-setting operation and note slipping, binding or abnormal feel.',50,true),
    ('crown_stem','function','Crown & stem','Check crown, stem positions, engagement and obvious damage or looseness.',60,true),
    ('complications','function','Calendar / complications','Check date, day, alarm, chronograph or other fitted functions as applicable.',70,false),
    ('automatic_winding','function','Automatic winding','Check rotor movement/noise and automatic winding behaviour where applicable.',80,false),
    ('crystal','condition','Crystal','Inspect scratches, cracks, chips, fit and obvious sealing concerns.',90,true),
    ('case','condition','Case','Inspect case, case back, bezel, pushers and external fittings.',100,true),
    ('dial_hands','condition','Dial & hands','Inspect dial, hands, lume, alignment and visible clearance issues.',110,true),
    ('strap_bracelet','condition','Strap / bracelet','Inspect strap, bracelet, clasp, spring bars and attachment security.',120,false),
    ('magnetism','performance','Magnetism','Check for magnetism where appropriate before drawing timing conclusions.',130,false),
    ('baseline_timing','performance','Baseline timing','Record a pre-work timing baseline when the movement runs well enough to measure.',140,false),
    ('movement_noise','performance','Noise / feel','Listen and feel for abnormal rotor, winding, train or movement behaviour.',150,false),
    ('movement_visual','movement','Movement visual inspection','When opened, record obvious contamination, corrosion, damage, missing parts or previous-work evidence.',160,false),
    ('reported_fault','intake','Reported fault / reason for work','Record the known complaint, auction note, seller statement or reason the watch entered Work.',170,true)
  ) as c(check_key,category,label,description,sequence,required)
  on conflict (work_id, check_key) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

create or replace function public.start_work_induction(
  p_workspace_id uuid,
  p_work_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_work public.work_records%rowtype;
  v_count integer := 0;
begin
  select * into v_work from public.work_records
  where workspace_id = p_workspace_id and id = p_work_id;
  if not found then raise exception 'Work record not found'; end if;
  if v_work.induction_status = 'legacy_skipped' then raise exception 'This legacy Work record does not require induction'; end if;
  if v_work.induction_status = 'complete' then return 0; end if;

  v_count := public.initialize_work_induction(p_workspace_id, p_work_id);

  update public.work_records
  set induction_status = 'in_progress',
      induction_started_at = coalesce(induction_started_at, now()),
      next_action = 'Complete workshop induction',
      updated_at = now()
  where workspace_id = p_workspace_id and id = p_work_id;

  insert into public.work_events(workspace_id, work_id, item_id, event_type, summary, details)
  values (p_workspace_id, p_work_id, v_work.item_id, 'induction_started', 'Workshop induction started', jsonb_build_object('induction_version', v_work.induction_version));

  return v_count;
end;
$function$;

create or replace function public.set_work_induction_check(
  p_workspace_id uuid,
  p_check_id uuid,
  p_status text,
  p_notes text default ''
)
returns public.work_induction_checks
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_check public.work_induction_checks%rowtype;
  v_existing_finding_id uuid;
begin
  if p_status <> all(array['pending','pass','problem','na']::text[]) then
    raise exception 'Unsupported induction result';
  end if;

  select * into v_check from public.work_induction_checks
  where workspace_id = p_workspace_id and id = p_check_id;
  if not found then raise exception 'Induction check not found'; end if;

  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
      and m.role = any(array['owner','editor']::text[])
  ) then
    raise exception 'Not authorised for this workspace';
  end if;

  update public.work_induction_checks
  set status = p_status,
      notes = coalesce(p_notes,''),
      updated_at = now()
  where id = p_check_id
  returning * into v_check;

  select id into v_existing_finding_id
  from public.work_findings
  where induction_check_id = p_check_id
  limit 1;

  if p_status = 'problem' then
    if v_existing_finding_id is null then
      insert into public.work_findings (
        workspace_id, work_id, item_id, induction_check_id,
        finding_type, severity, title, details, status
      ) values (
        v_check.workspace_id, v_check.work_id, v_check.item_id, v_check.id,
        'fault', 'moderate', v_check.label, coalesce(p_notes,''), 'open'
      );
    else
      update public.work_findings
      set title = v_check.label,
          details = coalesce(p_notes,''),
          status = 'open',
          updated_at = now()
      where id = v_existing_finding_id;
    end if;
  elsif v_existing_finding_id is not null then
    update public.work_findings
    set status = case when status = 'open' then 'resolved' else status end,
        updated_at = now()
    where id = v_existing_finding_id;
  end if;

  return v_check;
end;
$function$;

create or replace function public.complete_work_induction(
  p_workspace_id uuid,
  p_work_id uuid
)
returns public.work_records
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_work public.work_records%rowtype;
  v_required_open integer;
  v_problem_count integer;
begin
  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
      and m.role = any(array['owner','editor']::text[])
  ) then
    raise exception 'Not authorised for this workspace';
  end if;

  perform public.initialize_work_induction(p_workspace_id, p_work_id);

  select count(*) into v_required_open
  from public.work_induction_checks
  where workspace_id = p_workspace_id and work_id = p_work_id
    and required and status = 'pending';

  if v_required_open > 0 then
    raise exception 'Induction cannot be completed while % required checks remain unanswered', v_required_open;
  end if;

  select count(*) into v_problem_count
  from public.work_induction_checks
  where workspace_id = p_workspace_id and work_id = p_work_id and status = 'problem';

  update public.work_records
  set induction_status = 'complete',
      induction_started_at = coalesce(induction_started_at, now()),
      induction_completed_at = now(),
      job_plan_status = 'ready',
      next_action = 'Create job plan',
      updated_at = now()
  where workspace_id = p_workspace_id and id = p_work_id
  returning * into v_work;

  if not found then raise exception 'Work record not found'; end if;

  insert into public.work_events(workspace_id, work_id, item_id, event_type, summary, details)
  values (
    p_workspace_id, p_work_id, v_work.item_id,
    'induction_completed', 'Workshop induction completed',
    jsonb_build_object('problem_count', v_problem_count, 'induction_version', v_work.induction_version)
  );

  return v_work;
end;
$function$;

create or replace function public.apply_work_job_plan(
  p_workspace_id uuid,
  p_work_id uuid,
  p_actions text[]
)
returns integer
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_work public.work_records%rowtype;
  v_action text;
  v_count integer := 0;
  v_final_label text;
  v_final_description text;
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

  if v_work.induction_status not in ('complete','legacy_skipped') then
    raise exception 'Complete Workshop Induction before creating the job plan';
  end if;
  if v_work.job_plan_status = 'applied' then
    raise exception 'This Work already has an applied job plan';
  end if;
  if coalesce(cardinality(p_actions),0) = 0 then
    raise exception 'Choose at least one planned action';
  end if;
  if exists (select 1 from public.work_checklist_steps where workspace_id = p_workspace_id and work_id = p_work_id) then
    raise exception 'A checklist already exists for this Work';
  end if;

  foreach v_action in array p_actions loop
    if v_action <> all(array[
      'mechanical_service','repair_fault','regulation_timing','crystal_replacement','case_clean',
      'dial_hands','strap_bracelet','movement_replacement','restoration','further_diagnosis',
      'listing_prep','sell_as_is','donor','other'
    ]::text[]) then
      raise exception 'Unsupported planned action: %', v_action;
    end if;
  end loop;

  insert into public.work_plan_actions (
    workspace_id, work_id, item_id, action_key, label, sequence, procedure_template_id
  )
  select
    p_workspace_id,
    v_work.id,
    v_work.item_id,
    a.action_key,
    case a.action_key
      when 'mechanical_service' then 'Full mechanical service'
      when 'repair_fault' then 'Repair fault'
      when 'regulation_timing' then 'Regulation / timing'
      when 'crystal_replacement' then 'Crystal replacement'
      when 'case_clean' then 'Case clean / polish'
      when 'dial_hands' then 'Dial / hand work'
      when 'strap_bracelet' then 'Strap / bracelet'
      when 'movement_replacement' then 'Movement replacement'
      when 'restoration' then 'Restoration'
      when 'further_diagnosis' then 'Further diagnosis'
      when 'listing_prep' then 'Prepare for sale'
      when 'sell_as_is' then 'No repair / sell as-is'
      when 'donor' then 'Convert to donor'
      else 'Other workshop work'
    end,
    (a.ordinality::integer * 10),
    (
      select wt.id
      from public.work_templates wt
      where wt.workspace_id = p_workspace_id
        and wt.is_active
        and wt.slug = case a.action_key
          when 'mechanical_service' then 'mechanical-service'
          when 'repair_fault' then 'mechanical-repair'
          else '__no_procedure__'
        end
      order by wt.version desc
      limit 1
    )
  from unnest(p_actions) with ordinality as a(action_key, ordinality)
  on conflict (work_id, action_key) do nothing;

  insert into public.work_checklist_steps (
    workspace_id, work_id, item_id, template_id, template_step_id, plan_action_id, phase,
    step_key, section_key, label, description, sequence, required
  )
  select
    p_workspace_id,
    v_work.id,
    v_work.item_id,
    a.procedure_template_id,
    s.id,
    a.id,
    'procedure',
    a.action_key || ':' || s.step_key,
    s.section_key,
    s.label,
    s.description,
    (a.sequence * 1000) + s.sequence,
    s.required
  from public.work_plan_actions a
  join public.work_template_steps s
    on s.workspace_id = p_workspace_id and s.template_id = a.procedure_template_id
  where a.workspace_id = p_workspace_id
    and a.work_id = p_work_id
    and a.status = 'planned'
    and s.step_key <> 'final_qc'
  order by a.sequence, s.sequence;

  insert into public.work_checklist_steps (
    workspace_id, work_id, item_id, template_id, template_step_id, plan_action_id, phase,
    step_key, section_key, label, description, sequence, required
  )
  select
    p_workspace_id,
    v_work.id,
    v_work.item_id,
    null,
    null,
    a.id,
    'procedure',
    a.action_key || ':complete',
    'planned_work',
    a.label,
    case a.action_key
      when 'regulation_timing' then 'Complete the planned regulation/timing work and capture timing evidence.'
      when 'crystal_replacement' then 'Complete the crystal replacement and capture fit/presentation evidence.'
      when 'case_clean' then 'Complete the planned case clean/polish without altering finishes beyond the intended scope.'
      when 'dial_hands' then 'Complete the planned dial/hand work and confirm alignment and clearance.'
      when 'strap_bracelet' then 'Complete the strap/bracelet work and confirm secure attachment.'
      when 'movement_replacement' then 'Complete the movement replacement and confirm winding, setting, fit and casing.'
      when 'restoration' then 'Complete the agreed restoration scope and capture evidence of the result.'
      when 'further_diagnosis' then 'Investigate the induction findings and record a diagnosis before deciding further work.'
      when 'listing_prep' then 'Complete sale preparation, presentation and required listing evidence.'
      when 'sell_as_is' then 'Record the as-is decision, unresolved findings and sale disclosure requirements.'
      when 'donor' then 'Record the donor decision and preserve the Item cost/history before harvesting any parts.'
      else 'Complete this planned action and record the result.'
    end,
    (a.sequence * 1000) + 500,
    true
  from public.work_plan_actions a
  where a.workspace_id = p_workspace_id
    and a.work_id = p_work_id
    and a.status = 'planned'
    and a.procedure_template_id is null;

  if p_actions <@ array['sell_as_is','donor']::text[] then
    v_final_label := 'Disposition review';
    v_final_description := 'Confirm the final disposition, required disclosures, evidence and inventory/financial history before closing Work.';
  else
    v_final_label := 'Final QC';
    v_final_description := 'Compare finished function, condition and timing against the induction baseline. Confirm required evidence and unresolved findings before closing Work.';
  end if;

  insert into public.work_checklist_steps (
    workspace_id, work_id, item_id, template_id, template_step_id, plan_action_id, phase,
    step_key, section_key, label, description, sequence, required
  ) values (
    p_workspace_id, v_work.id, v_work.item_id, null, null, null, 'final_qc',
    'final_qc', 'qc', v_final_label, v_final_description, 900000, true
  );

  select count(*) into v_count
  from public.work_checklist_steps
  where workspace_id = p_workspace_id and work_id = p_work_id;

  update public.work_records
  set job_plan_status = 'applied',
      type = case
        when 'mechanical_service' = any(p_actions) then 'service'
        when 'repair_fault' = any(p_actions) or 'crystal_replacement' = any(p_actions) or 'movement_replacement' = any(p_actions) then 'repair'
        when 'restoration' = any(p_actions) then 'restoration'
        when 'case_clean' = any(p_actions) then 'cleaning'
        when 'further_diagnosis' = any(p_actions) then 'assessment'
        when 'listing_prep' = any(p_actions) then 'listing_prep'
        else type
      end,
      status = case when status = 'queued' then 'ready' else status end,
      next_action = coalesce((
        select label from public.work_checklist_steps
        where workspace_id = p_workspace_id and work_id = p_work_id
          and status not in ('done','na')
        order by sequence limit 1
      ), 'Review job plan'),
      updated_at = now()
  where workspace_id = p_workspace_id and id = p_work_id;

  insert into public.work_events(workspace_id, work_id, item_id, event_type, summary, details)
  values (
    p_workspace_id, p_work_id, v_work.item_id,
    'job_plan_applied', 'Job plan created after induction',
    jsonb_build_object('actions', to_jsonb(p_actions), 'checklist_steps', v_count)
  );

  return v_count;
end;
$function$;

-- New Work no longer assumes service/repair procedure. It enters induction first.
create or replace function public.start_work(
  p_workspace_id uuid,
  p_item_id uuid,
  p_type text default 'assessment',
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

  if not exists (select 1 from public.items where workspace_id = p_workspace_id and id = p_item_id) then
    raise exception 'Item not found';
  end if;

  if p_type <> all(array['inspection','service','repair','restoration','cleaning','assessment','photography','listing_prep','qc','other']::text[]) then
    raise exception 'Unsupported Work type';
  end if;

  v_title := coalesce(nullif(btrim(p_title),''), 'Workshop job');

  insert into public.work_records (
    workspace_id, item_id, type, title, status, template_id,
    induction_status, induction_version, job_plan_status, next_action
  ) values (
    p_workspace_id, p_item_id, p_type, v_title, 'queued', null,
    'pending', 1, 'pending', 'Start workshop induction'
  ) returning * into v_work;

  perform public.initialize_work_induction(p_workspace_id, v_work.id);

  insert into public.work_events(workspace_id, work_id, item_id, event_type, summary, details)
  values (
    p_workspace_id, v_work.id, p_item_id,
    'work_started', 'Workshop job created — induction required',
    jsonb_build_object('work_type', p_type, 'induction_version', 1, 'requested_template_id', p_template_id)
  );

  return v_work;
end;
$function$;

revoke all on function public.initialize_work_induction(uuid, uuid) from public, anon;
revoke all on function public.start_work_induction(uuid, uuid) from public, anon;
revoke all on function public.set_work_induction_check(uuid, uuid, text, text) from public, anon;
revoke all on function public.complete_work_induction(uuid, uuid) from public, anon;
revoke all on function public.apply_work_job_plan(uuid, uuid, text[]) from public, anon;
grant execute on function public.initialize_work_induction(uuid, uuid) to authenticated;
grant execute on function public.start_work_induction(uuid, uuid) to authenticated;
grant execute on function public.set_work_induction_check(uuid, uuid, text, text) to authenticated;
grant execute on function public.complete_work_induction(uuid, uuid) to authenticated;
grant execute on function public.apply_work_job_plan(uuid, uuid, text[]) to authenticated;
