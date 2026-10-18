create or replace function public.get_workshop_memory(
  p_workspace_id uuid,
  p_item_id uuid,
  p_work_id uuid default null,
  p_limit integer default 20
)
returns table(
  memory_kind text,
  title text,
  summary text,
  detail text,
  evidence_label text,
  evidence_strength integer,
  source_work_id uuid,
  source_item_id uuid,
  source_work_number bigint,
  source_item_number bigint,
  recorded_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $function$
with authorised as (
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = (select auth.uid())
  ) as ok
), target as (
  select p.knowledge_movement_id
  from public.passports p, authorised a
  where a.ok
    and p.workspace_id = p_workspace_id
    and p.item_id = p_item_id
    and p.knowledge_movement_id is not null
    and p.movement_identification_status in ('probable','confirmed')
  limit 1
), eligible_work as (
  select wr.id, wr.item_id, wr.work_number, wr.status, wr.diagnosis, wr.repair_performed,
         wr.completion_summary, wr.completed_at, wr.template_id, i.item_number,
         p.knowledge_movement_id
  from public.work_records wr
  join public.items i on i.workspace_id = wr.workspace_id and i.id = wr.item_id
  join public.passports p on p.workspace_id = wr.workspace_id and p.item_id = wr.item_id
  join target t on t.knowledge_movement_id = p.knowledge_movement_id
  where wr.workspace_id = p_workspace_id
    and wr.data_mode = 'real'
    and (p_work_id is null or wr.id <> p_work_id)
    and p.movement_identification_status in ('probable','confirmed')
), session_time as (
  select s.work_id,
         coalesce(sum(extract(epoch from (coalesce(s.ended_at, now()) - s.started_at))),0)::bigint as seconds_worked
  from public.work_session_segments s
  join eligible_work ew on ew.id = s.work_id
  where s.workspace_id = p_workspace_id
  group by s.work_id
), repair_memories as (
  select
    'repair_outcome'::text as memory_kind,
    coalesce(nullif(ew.completion_summary,''), nullif(ew.repair_performed,''), 'Completed repair') as title,
    concat_ws(' · ', nullif(ew.diagnosis,''), nullif(ew.repair_performed,'')) as summary,
    case when st.seconds_worked > 0 then 'Recorded bench time ' || round(st.seconds_worked / 3600.0, 1)::text || ' h' else '' end as detail,
    'Completed Real Work on the same identified movement'::text as evidence_label,
    100::integer as evidence_strength,
    ew.id as source_work_id,
    ew.item_id as source_item_id,
    ew.work_number as source_work_number,
    ew.item_number as source_item_number,
    ew.completed_at as recorded_at
  from eligible_work ew
  left join session_time st on st.work_id = ew.id
  where ew.status = 'complete' and ew.completed_at is not null
), latest_timing as (
  select distinct on (tr.work_id)
    tr.work_id, tr.rate_seconds_per_day, tr.beat_error_ms, tr.amplitude_deg,
    tr.bph, tr.position, tr.checkpoint, tr.confidence, tr.recorded_at
  from public.timing_runs tr
  join eligible_work ew on ew.id = tr.work_id
  where ew.status = 'complete'
  order by tr.work_id,
    case lower(coalesce(tr.checkpoint,'')) when 'final' then 0 when 'post_service' then 1 when 'qc' then 2 else 3 end,
    tr.recorded_at desc
), timing_memories as (
  select
    'timing_outcome'::text as memory_kind,
    'Final timing outcome'::text as title,
    concat_ws(' · ',
      case when lt.rate_seconds_per_day is not null then (case when lt.rate_seconds_per_day >= 0 then '+' else '' end) || trim(to_char(lt.rate_seconds_per_day,'FM999990.0')) || ' s/day' end,
      case when lt.beat_error_ms is not null then trim(to_char(lt.beat_error_ms,'FM999990.00')) || ' ms beat error' end,
      case when lt.amplitude_deg is not null then trim(to_char(lt.amplitude_deg,'FM999990')) || '° amplitude' end,
      nullif(lt.position,''), nullif(lt.checkpoint,'')
    ) as summary,
    case when lt.bph is not null then lt.bph::text || ' BPH' else '' end as detail,
    'Timing recorded on completed Real Work for the same movement'::text as evidence_label,
    case lower(coalesce(lt.confidence,'')) when 'high' then 95 when 'medium' then 85 else 75 end::integer as evidence_strength,
    ew.id as source_work_id,
    ew.item_id as source_item_id,
    ew.work_number as source_work_number,
    ew.item_number as source_item_number,
    lt.recorded_at as recorded_at
  from latest_timing lt
  join eligible_work ew on ew.id = lt.work_id
), fit_memories as (
  select
    'part_fit'::text as memory_kind,
    case pf.result when 'confirmed' then 'Confirmed part fit' else 'Conditional part fit' end as title,
    concat_ws(' · ', nullif(trim(concat_ws(' ', p.manufacturer, p.reference)),''), nullif(p.description,''), nullif(p.part_type,'')) as summary,
    concat_ws(' · ', nullif(pf.evidence_note,''), case when pf.modification_required then 'Modification required' end) as detail,
    case pf.result when 'confirmed' then 'Bench-confirmed fit on Real Work' else 'Conditional bench fit on Real Work' end as evidence_label,
    case pf.result when 'confirmed' then 100 else 80 end::integer as evidence_strength,
    ew.id as source_work_id,
    ew.item_id as source_item_id,
    ew.work_number as source_work_number,
    ew.item_number as source_item_number,
    pf.verified_at as recorded_at
  from public.part_fit_verifications pf
  join eligible_work ew on ew.id = pf.work_record_id
  join public.parts p on p.workspace_id = pf.workspace_id and p.id = pf.part_id
  join target t on pf.knowledge_movement_id = t.knowledge_movement_id
  where pf.workspace_id = p_workspace_id
    and pf.result in ('confirmed','conditional')
), finding_groups as (
  select lower(trim(wf.title)) as finding_key,
         min(wf.title) as display_title,
         count(distinct wf.work_id)::integer as occurrences,
         max(wf.updated_at) as latest_at,
         (array_agg(wf.work_id order by wf.updated_at desc))[1] as latest_work_id
  from public.work_findings wf
  join eligible_work ew on ew.id = wf.work_id
  where ew.status = 'complete'
    and wf.status in ('resolved','closed','accepted')
    and trim(wf.title) <> ''
  group by lower(trim(wf.title))
  having count(distinct wf.work_id) >= 2
), finding_memories as (
  select
    'recurring_finding'::text as memory_kind,
    fg.display_title as title,
    fg.occurrences::text || ' completed Real jobs on this movement recorded the same finding' as summary,
    ''::text as detail,
    'Repeated resolved finding across completed Real Work'::text as evidence_label,
    least(100, 70 + fg.occurrences * 5)::integer as evidence_strength,
    ew.id as source_work_id,
    ew.item_id as source_item_id,
    ew.work_number as source_work_number,
    ew.item_number as source_item_number,
    fg.latest_at as recorded_at
  from finding_groups fg
  join eligible_work ew on ew.id = fg.latest_work_id
), combined as (
  select * from repair_memories
  union all select * from timing_memories
  union all select * from fit_memories
  union all select * from finding_memories
)
select * from combined
order by evidence_strength desc, recorded_at desc nulls last
limit greatest(1, least(coalesce(p_limit,20),100));
$function$;

revoke all on function public.get_workshop_memory(uuid,uuid,uuid,integer) from public;
revoke all on function public.get_workshop_memory(uuid,uuid,uuid,integer) from anon;
grant execute on function public.get_workshop_memory(uuid,uuid,uuid,integer) to authenticated;
