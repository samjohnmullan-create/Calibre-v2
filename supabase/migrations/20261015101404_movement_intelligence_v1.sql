alter table public.passports
  add column if not exists movement_identification_confidence text not null default 'unknown',
  add column if not exists movement_identification_basis jsonb not null default '[]'::jsonb,
  add column if not exists movement_identified_at timestamptz,
  add column if not exists movement_identified_by uuid references auth.users(id) on delete set null;

alter table public.passports drop constraint if exists passports_movement_identification_status_check;
alter table public.passports add constraint passports_movement_identification_status_check
  check (movement_identification_status = any (array['unlinked'::text,'candidate'::text,'probable'::text,'confirmed'::text,'rejected'::text]));
alter table public.passports add constraint passports_movement_identification_confidence_check
  check (movement_identification_confidence = any (array['unknown'::text,'low'::text,'medium'::text,'high'::text]));
alter table public.passports add constraint passports_movement_identification_basis_check
  check (jsonb_typeof(movement_identification_basis) = 'array'::text);
create index if not exists passports_movement_identified_by_idx on public.passports(movement_identified_by);

create table if not exists public.knowledge_movement_guidance (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid not null references public.knowledge_movements(id) on delete cascade,
  step_key text not null check (btrim(step_key) <> ''),
  guidance_type text not null check (guidance_type = any (array['inspection','procedure','warning','lubrication','diagnostic','measurement','timing','parts','check']::text[])),
  title text not null check (btrim(title) <> ''),
  instruction text not null check (btrim(instruction) <> ''),
  check_key text not null default '',
  check_type text not null default 'knowledge' check (check_type = any (array['inspection','action','observation','decision','photo','measurement','timing','knowledge','part','qc']::text[])),
  tool_key text not null default 'knowledge' check (tool_key = any (array['','photo','measurement','timing','knowledge','parts','research','diagnosis']::text[])),
  answer_kind text not null default 'status' check (answer_kind = any (array['status','yes_no','choice','text','number','tool_result']::text[])),
  answer_options jsonb not null default '[]'::jsonb check (jsonb_typeof(answer_options) = 'array'),
  problem_values jsonb not null default '[]'::jsonb check (jsonb_typeof(problem_values) = 'array'),
  required boolean not null default false,
  inject_as_check boolean not null default false,
  sequence integer not null default 100 check (sequence >= 0),
  source_id uuid not null references public.knowledge_sources(id) on delete restrict,
  reference_text text not null default '',
  evidence_grade text not null default 'documented',
  verification_status text not null default 'candidate',
  origin_kind text not null default 'knowledge',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_movement_guidance_check_key_required check (not inject_as_check or btrim(check_key) <> ''),
  constraint knowledge_movement_guidance_unique unique (movement_id, step_key, title, source_id)
);

create index if not exists knowledge_movement_guidance_movement_step_idx
  on public.knowledge_movement_guidance(movement_id, step_key, active, sequence);
create index if not exists knowledge_movement_guidance_source_idx
  on public.knowledge_movement_guidance(source_id);

alter table public.knowledge_movement_guidance enable row level security;
drop policy if exists knowledge_movement_guidance_read on public.knowledge_movement_guidance;
create policy knowledge_movement_guidance_read on public.knowledge_movement_guidance
  for select to authenticated using (true);
drop policy if exists knowledge_movement_guidance_manage on public.knowledge_movement_guidance;
create policy knowledge_movement_guidance_manage on public.knowledge_movement_guidance
  for all to authenticated using (private.can_manage_knowledge()) with check (private.can_manage_knowledge());
grant select, insert, update, delete on public.knowledge_movement_guidance to authenticated;

alter table public.calibre_diagnostic_effect_rules
  add column if not exists knowledge_movement_id uuid references public.knowledge_movements(id) on delete cascade,
  add column if not exists source_id uuid references public.knowledge_sources(id) on delete set null,
  add column if not exists reference_text text not null default '',
  add column if not exists evidence_grade text not null default '',
  add column if not exists origin_kind text not null default 'generic';

alter table public.calibre_diagnostic_effect_rules drop constraint if exists calibre_diag_movement_rule_source_check;
alter table public.calibre_diagnostic_effect_rules add constraint calibre_diag_movement_rule_source_check
  check (knowledge_movement_id is null or source_id is not null);
create index if not exists calibre_diag_rules_movement_idx on public.calibre_diagnostic_effect_rules(knowledge_movement_id) where knowledge_movement_id is not null;
create index if not exists calibre_diag_rules_source_idx on public.calibre_diagnostic_effect_rules(source_id) where source_id is not null;

alter table public.work_step_checks
  add column if not exists source_movement_guidance_id uuid references public.knowledge_movement_guidance(id) on delete set null;
alter table public.work_step_checks drop constraint if exists work_step_checks_origin_kind_check;
alter table public.work_step_checks add constraint work_step_checks_origin_kind_check
  check (origin_kind = any (array['template','deterministic','ai_reasoning','movement_knowledge','manual']::text[]));
create index if not exists work_step_checks_movement_guidance_idx on public.work_step_checks(source_movement_guidance_id) where source_movement_guidance_id is not null;
create unique index if not exists work_step_checks_work_movement_guidance_unique
  on public.work_step_checks(work_id, source_movement_guidance_id) where source_movement_guidance_id is not null;

create or replace function public.find_movement_candidates_v2(
  p_markings text default '', p_maker text default '', p_diameter_mm numeric default null,
  p_height_mm numeric default null, p_jewels integer default null, p_bph integer default null,
  p_winding text default '', p_limit integer default 25
)
returns table(
  id uuid, maker text, calibre text, calibre_family text, diameter_mm numeric, height_mm numeric,
  jewels integer, bph integer, winding text, power_reserve_hours numeric, escapement text,
  evidence_grade text, verification_status text, score numeric, reasons text[], source_count integer,
  confidence_band text
)
language sql stable security invoker set search_path = public
as $$
with inputs as (
  select lower(trim(coalesce(p_markings,''))) markings,
         lower(trim(coalesce(p_maker,''))) maker_q,
         lower(trim(coalesce(p_winding,''))) winding_q
), source_stats as (
  select movement_id, count(*)::integer source_count
  from public.knowledge_movement_sources group by movement_id
), scored as (
  select km.*,
    coalesce(ss.source_count,0) as source_count,
    (
      case when i.maker_q='' then 0 when lower(km.maker)=i.maker_q then 25 when lower(km.maker) like '%'||i.maker_q||'%' then 14 else 0 end
      + case when i.markings='' then 0 when lower(trim(km.maker||' '||km.calibre))=i.markings then 32 when lower(km.calibre)=i.markings then 28 when lower(km.calibre) like '%'||i.markings||'%' then 18 when lower(km.maker||' '||km.calibre||' '||km.calibre_family) like '%'||i.markings||'%' then 12 when lower(km.search_aliases::text) like '%'||i.markings||'%' then 10 when lower(km.common_brands::text) like '%'||i.markings||'%' then 8 else 0 end
      + case when p_diameter_mm is null or km.diameter_mm is null then 0 when abs(km.diameter_mm-p_diameter_mm)<=0.10 then 22 when abs(km.diameter_mm-p_diameter_mm)<=0.30 then 16 when abs(km.diameter_mm-p_diameter_mm)<=0.60 then 9 when abs(km.diameter_mm-p_diameter_mm)<=1.00 then 3 else 0 end
      + case when p_height_mm is null or km.height_mm is null then 0 when abs(km.height_mm-p_height_mm)<=0.10 then 14 when abs(km.height_mm-p_height_mm)<=0.30 then 9 when abs(km.height_mm-p_height_mm)<=0.60 then 4 else 0 end
      + case when p_bph is not null and km.bph=p_bph then 18 else 0 end
      + case when i.winding_q<>'' and lower(km.winding)=i.winding_q then 10 else 0 end
      + case when p_jewels is not null and km.jewels=p_jewels then 8 else 0 end
      + case lower(coalesce(km.evidence_grade,'')) when 'verified' then 10 when 'manufacturer' then 9 when 'documented' then 8 when 'supported' then 5 when 'candidate' then 1 else 0 end
    )::numeric raw_score,
    array_remove(array[
      case when i.maker_q<>'' and lower(km.maker)=i.maker_q then 'Maker exact' when i.maker_q<>'' and lower(km.maker) like '%'||i.maker_q||'%' then 'Maker partial' end,
      case when i.markings<>'' and lower(trim(km.maker||' '||km.calibre))=i.markings then 'Marking exact' when i.markings<>'' and lower(km.calibre)=i.markings then 'Calibre exact' when i.markings<>'' and lower(km.calibre) like '%'||i.markings||'%' then 'Calibre contains marking' when i.markings<>'' and lower(km.search_aliases::text) like '%'||i.markings||'%' then 'Alias match' end,
      case when p_diameter_mm is not null and km.diameter_mm is not null and abs(km.diameter_mm-p_diameter_mm)<=0.10 then 'Diameter ±0.10 mm' when p_diameter_mm is not null and km.diameter_mm is not null and abs(km.diameter_mm-p_diameter_mm)<=0.30 then 'Diameter ±0.30 mm' when p_diameter_mm is not null and km.diameter_mm is not null and abs(km.diameter_mm-p_diameter_mm)<=0.60 then 'Diameter ±0.60 mm' end,
      case when p_height_mm is not null and km.height_mm is not null and abs(km.height_mm-p_height_mm)<=0.10 then 'Height ±0.10 mm' when p_height_mm is not null and km.height_mm is not null and abs(km.height_mm-p_height_mm)<=0.30 then 'Height ±0.30 mm' end,
      case when p_bph is not null and km.bph=p_bph then 'BPH exact' end,
      case when i.winding_q<>'' and lower(km.winding)=i.winding_q then 'Winding exact' end,
      case when p_jewels is not null and km.jewels=p_jewels then 'Jewels exact' end,
      case lower(coalesce(km.evidence_grade,'')) when 'verified' then 'Calibre Verified evidence' when 'manufacturer' then 'Manufacturer evidence' when 'documented' then 'Documented evidence' when 'supported' then 'Supported evidence' end,
      case when coalesce(ss.source_count,0)>0 then coalesce(ss.source_count,0)::text||' linked source'||case when ss.source_count=1 then '' else 's' end end
    ], null) why
  from public.knowledge_movements km
  cross join inputs i
  left join source_stats ss on ss.movement_id=km.id
  where (i.maker_q='' or lower(km.maker) like '%'||i.maker_q||'%')
    and (p_diameter_mm is null or km.diameter_mm is null or abs(km.diameter_mm-p_diameter_mm)<=1.50)
    and (p_height_mm is null or km.height_mm is null or abs(km.height_mm-p_height_mm)<=1.00)
    and (p_bph is null or km.bph is null or km.bph=p_bph)
    and (i.winding_q='' or km.winding='' or lower(km.winding)=i.winding_q)
    and (i.markings='' or lower(km.maker||' '||km.calibre||' '||km.calibre_family) like '%'||i.markings||'%' or lower(km.search_aliases::text) like '%'||i.markings||'%' or lower(km.common_brands::text) like '%'||i.markings||'%')
)
select s.id,s.maker,s.calibre,s.calibre_family,s.diameter_mm,s.height_mm,s.jewels,s.bph,s.winding,
       s.power_reserve_hours,s.escapement,s.evidence_grade,s.verification_status,s.raw_score,s.why,s.source_count,
       case
         when s.raw_score>=75 and cardinality(s.why)>=3 and s.source_count>0 and lower(coalesce(s.evidence_grade,'')) in ('verified','manufacturer','documented') then 'high'
         when s.raw_score>=45 and cardinality(s.why)>=2 then 'medium'
         else 'low'
       end confidence_band
from scored s
where s.raw_score>0
order by s.raw_score desc,
  case lower(coalesce(s.evidence_grade,'')) when 'verified' then 0 when 'manufacturer' then 1 when 'documented' then 2 when 'supported' then 3 when 'candidate' then 4 when 'generated' then 5 else 6 end,
  s.maker,s.calibre
limit greatest(1, least(coalesce(p_limit,25),100));
$$;
grant execute on function public.find_movement_candidates_v2(text,text,numeric,numeric,integer,integer,text,integer) to authenticated;

create or replace function public.set_passport_movement_identification_state(
  p_workspace_id uuid, p_item_id uuid, p_status text, p_note text default ''
) returns void
language plpgsql security invoker set search_path=public
as $$
begin
  if p_status not in ('candidate','probable','confirmed','rejected') then
    raise exception 'Unsupported movement identification status';
  end if;
  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id=p_workspace_id and m.user_id=(select auth.uid()) and m.role in ('owner','editor')
  ) then raise exception 'Not authorised'; end if;
  if p_status in ('probable','confirmed') and not exists (
    select 1 from public.passports p where p.workspace_id=p_workspace_id and p.item_id=p_item_id and p.knowledge_movement_id is not null
  ) then raise exception 'A Knowledge movement must be linked before this identification can be promoted'; end if;

  update public.passports p set
    movement_identification_status=p_status,
    movement_identified_at=case when p_status in ('probable','confirmed') then now() else p.movement_identified_at end,
    movement_identified_by=case when p_status in ('probable','confirmed') then (select auth.uid()) else p.movement_identified_by end,
    movement_identification_basis=coalesce(p.movement_identification_basis,'[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'type','watchmaker_status_change','status',p_status,'note',coalesce(p_note,''),'at',now(),'user_id',(select auth.uid())
    )),
    updated_at=now()
  where p.workspace_id=p_workspace_id and p.item_id=p_item_id;
  if not found then raise exception 'Passport not found'; end if;
end;
$$;
grant execute on function public.set_passport_movement_identification_state(uuid,uuid,text,text) to authenticated;

create or replace function public.schedule_movement_guidance_check(
  p_workspace_id uuid, p_work_id uuid, p_guidance_id uuid
) returns uuid
language plpgsql security invoker set search_path=public
as $$
declare
  g public.knowledge_movement_guidance%rowtype;
  w public.work_records%rowtype;
  p public.passports%rowtype;
  step_row public.work_checklist_steps%rowtype;
  existing_id uuid;
  new_id uuid;
  next_sequence integer;
begin
  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id=p_workspace_id and m.user_id=(select auth.uid()) and m.role in ('owner','editor')
  ) then raise exception 'Not authorised'; end if;

  select * into w from public.work_records where workspace_id=p_workspace_id and id=p_work_id;
  if not found then raise exception 'Work not found'; end if;
  select * into p from public.passports where workspace_id=p_workspace_id and item_id=w.item_id;
  if not found or p.knowledge_movement_id is null then raise exception 'No movement is linked to this Passport'; end if;
  if p.movement_identification_status not in ('probable','confirmed') then raise exception 'Movement identity must be Probable or Confirmed before movement-specific checks can be added'; end if;

  select * into g from public.knowledge_movement_guidance where id=p_guidance_id and active and inject_as_check;
  if not found then raise exception 'Movement guidance check not found'; end if;
  if g.movement_id<>p.knowledge_movement_id then raise exception 'Guidance does not match the linked movement'; end if;

  select id into existing_id from public.work_step_checks where workspace_id=p_workspace_id and work_id=p_work_id and source_movement_guidance_id=g.id limit 1;
  if existing_id is not null then return existing_id; end if;

  select * into step_row from public.work_checklist_steps
  where workspace_id=p_workspace_id and work_id=p_work_id and step_key=g.step_key
  order by sequence limit 1;
  if not found then raise exception 'This Work does not contain the required procedure stage: %', g.step_key; end if;
  if step_row.status in ('complete','not_applicable','done','na') then raise exception 'The target procedure stage is already complete'; end if;

  select coalesce(max(sequence),0)+1 into next_sequence from public.work_step_checks where checklist_step_id=step_row.id;
  insert into public.work_step_checks(
    workspace_id,work_id,item_id,checklist_step_id,check_key,label,description,sequence,required,
    check_type,tool_key,knowledge_scope,evidence_required,status,answer_kind,answer_options,activation_rule,
    problem_values,answer_value,is_active,state_reason,origin_kind,source_movement_guidance_id
  ) values (
    p_workspace_id,p_work_id,w.item_id,step_row.id,g.check_key,g.title,g.instruction,next_sequence,g.required,
    g.check_type,g.tool_key,'movement:'||g.movement_id::text,false,'not_started',g.answer_kind,g.answer_options,'{}'::jsonb,
    g.problem_values,'',true,'Added from sourced movement guidance','movement_knowledge',g.id
  ) returning id into new_id;
  return new_id;
end;
$$;
grant execute on function public.schedule_movement_guidance_check(uuid,uuid,uuid) to authenticated;

create or replace function public.get_work_diagnostic_graph(p_workspace_id uuid, p_work_id uuid)
returns table(hypothesis_key text,title text,description text,category text,support_state text,score integer,evidence_count integer,supports_count integer,against_count integer,contradiction boolean,evidence_for jsonb,evidence_against jsonb)
language sql stable security invoker set search_path=public
as $$
with authorised as (
  select 1 ok from public.workspace_members m where m.workspace_id=p_workspace_id and m.user_id=(select auth.uid()) limit 1
), work_context as (
  select w.item_id,p.knowledge_movement_id,p.movement_identification_status
  from authorised a join public.work_records w on w.workspace_id=p_workspace_id and w.id=p_work_id
  left join public.passports p on p.workspace_id=w.workspace_id and p.item_id=w.item_id
), matched as (
  select h.hypothesis_key,h.title,h.description,h.category,h.sequence,s.step_key,s.label stage_label,
    c.id work_step_check_id,c.check_key,c.label check_label,c.answer_value,c.result_text,
    r.effect,r.strength,r.rationale,r.knowledge_movement_id,r.source_id,r.reference_text,r.evidence_grade,r.origin_kind,
    case r.strength when 'strong' then 3 when 'moderate' then 2 else 1 end weight
  from authorised a
  join public.work_checklist_steps s on s.workspace_id=p_workspace_id and s.work_id=p_work_id
  join public.work_step_checks c on c.workspace_id=s.workspace_id and c.checklist_step_id=s.id
  join public.calibre_diagnostic_effect_rules r on r.active and r.step_key=s.step_key and r.check_key=c.check_key and r.answer_value=c.answer_value
  join public.calibre_diagnostic_hypotheses h on h.active and h.hypothesis_key=r.hypothesis_key
  cross join work_context wc
  where c.status='complete' and c.is_active and btrim(c.answer_value)<>''
    and (r.knowledge_movement_id is null or (r.knowledge_movement_id=wc.knowledge_movement_id and wc.movement_identification_status in ('probable','confirmed')))
), aggregated as (
  select m.hypothesis_key,max(m.title) title,max(m.description) description,max(m.category) category,min(m.sequence) sequence,
    sum(case when m.effect in ('supports','confirms') then m.weight when m.effect in ('weakens','rules_out') then -m.weight else 0 end)::integer score,
    count(*)::integer evidence_count,
    count(*) filter(where m.effect in ('supports','confirms'))::integer supports_count,
    count(*) filter(where m.effect in ('weakens','rules_out'))::integer against_count,
    bool_or(m.effect='confirms') has_confirm,bool_or(m.effect='rules_out') has_rule_out,
    jsonb_agg(jsonb_build_object('stage',m.stage_label,'step_key',m.step_key,'check',m.check_label,'check_key',m.check_key,'answer',m.answer_value,'effect',m.effect,'strength',m.strength,'rationale',m.rationale,'note',coalesce(m.result_text,''),'work_step_check_id',m.work_step_check_id,'movement_specific',m.knowledge_movement_id is not null,'source_id',m.source_id,'reference_text',m.reference_text,'evidence_grade',m.evidence_grade) order by m.stage_label,m.check_label) filter(where m.effect in ('supports','confirms')) evidence_for,
    jsonb_agg(jsonb_build_object('stage',m.stage_label,'step_key',m.step_key,'check',m.check_label,'check_key',m.check_key,'answer',m.answer_value,'effect',m.effect,'strength',m.strength,'rationale',m.rationale,'note',coalesce(m.result_text,''),'work_step_check_id',m.work_step_check_id,'movement_specific',m.knowledge_movement_id is not null,'source_id',m.source_id,'reference_text',m.reference_text,'evidence_grade',m.evidence_grade) order by m.stage_label,m.check_label) filter(where m.effect in ('weakens','rules_out')) evidence_against
  from matched m group by m.hypothesis_key
), resolved as (
  select a.*,case when a.has_confirm then 'confirmed' when a.has_rule_out and a.supports_count=0 then 'ruled_out' when a.score>=5 then 'strongly_supported' when a.score>=2 then 'supported' when a.score<=-3 then 'weak' else 'possible' end resolved_state
  from aggregated a
)
select r.hypothesis_key,r.title,r.description,r.category,r.resolved_state,r.score,r.evidence_count,r.supports_count,r.against_count,
  (r.supports_count>0 and r.against_count>0),coalesce(r.evidence_for,'[]'::jsonb),coalesce(r.evidence_against,'[]'::jsonb)
from resolved r
order by case r.resolved_state when 'confirmed' then 0 when 'strongly_supported' then 1 when 'supported' then 2 when 'possible' then 3 when 'weak' then 4 when 'ruled_out' then 5 else 6 end,
  r.score desc,r.sequence,r.title;
$$;
grant execute on function public.get_work_diagnostic_graph(uuid,uuid) to authenticated;
