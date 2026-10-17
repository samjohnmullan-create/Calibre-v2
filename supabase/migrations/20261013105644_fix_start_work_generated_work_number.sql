create or replace function public.start_work(
  p_workspace_id uuid,
  p_item_id uuid,
  p_type text default 'service'::text,
  p_title text default null::text,
  p_template_id uuid default null::uuid
)
returns public.work_records
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_work public.work_records;
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

  if not exists (
    select 1 from public.items
    where workspace_id = p_workspace_id and id = p_item_id
  ) then
    raise exception 'Item not found';
  end if;

  if p_type <> all(array['inspection','service','repair','restoration','cleaning','assessment','photography','listing_prep','qc','other']::text[]) then
    raise exception 'Unsupported Work type';
  end if;

  v_template_id := p_template_id;
  if v_template_id is null then
    select id into v_template_id
    from public.work_templates
    where workspace_id = p_workspace_id
      and work_type = p_type
      and is_active
    order by version desc
    limit 1;
  end if;

  if v_template_id is not null and not exists (
    select 1 from public.work_templates
    where workspace_id = p_workspace_id and id = v_template_id
  ) then
    raise exception 'Template not found in this workspace';
  end if;

  select coalesce(nullif(btrim(p_title),''), wt.name, initcap(replace(p_type,'_',' ')))
  into v_title
  from (select 1) x
  left join public.work_templates wt on wt.id = v_template_id;

  insert into public.work_records (
    workspace_id, item_id, type, title, status, template_id
  ) values (
    p_workspace_id, p_item_id, p_type, v_title, 'queued', v_template_id
  ) returning * into v_work;

  if v_template_id is not null then
    perform public.initialize_work_checklist(p_workspace_id, v_work.id, v_template_id);
  end if;

  insert into public.work_events(
    workspace_id, work_id, item_id, event_type, summary, details
  ) values (
    p_workspace_id,
    v_work.id,
    p_item_id,
    'work_started',
    'Work record created',
    jsonb_build_object('work_type', p_type, 'template_id', v_template_id)
  );

  return v_work;
end;
$$;

revoke execute on function public.start_work(uuid, uuid, text, text, uuid) from public, anon;
grant execute on function public.start_work(uuid, uuid, text, text, uuid) to authenticated;
