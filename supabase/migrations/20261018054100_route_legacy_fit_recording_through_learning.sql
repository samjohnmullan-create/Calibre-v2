-- Keep the existing Work UI/API compatible while ensuring every new fit records permanent source/target snapshots.

create or replace function public.record_part_fit_result(
  p_workspace_id uuid,
  p_part_id uuid,
  p_item_id uuid,
  p_work_record_id uuid,
  p_result text,
  p_note text default ''
)
returns public.part_fit_verifications
language sql
security invoker
set search_path = public
as $function$
  select public.record_part_fit_feedback(
    p_workspace_id,
    p_part_id,
    p_item_id,
    p_work_record_id,
    p_result,
    p_note,
    (p_result = 'conditional'),
    '{}'::jsonb
  );
$function$;

revoke execute on function public.record_part_fit_result(uuid, uuid, uuid, uuid, text, text) from public, anon;
grant execute on function public.record_part_fit_result(uuid, uuid, uuid, uuid, text, text) to authenticated;
