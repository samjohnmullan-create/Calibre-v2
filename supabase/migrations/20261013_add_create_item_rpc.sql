create or replace function public.create_item(
  p_workspace_id uuid,
  p_title text,
  p_type text default 'watch',
  p_purpose text default 'resale',
  p_notes text default ''
)
returns public.items
language plpgsql
set search_path = public
as $$
declare
  v_item public.items;
  v_number bigint;
begin
  if not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner','editor')
  ) then
    raise exception 'Not authorised for this workspace';
  end if;

  if nullif(btrim(p_title), '') is null then
    raise exception 'Item title is required';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_workspace_id::text));

  select coalesce(max(item_number), 0) + 1
    into v_number
  from public.items
  where workspace_id = p_workspace_id;

  insert into public.items (
    workspace_id, item_number, type, purpose, status, title, notes
  ) values (
    p_workspace_id,
    v_number,
    coalesce(nullif(btrim(p_type), ''), 'watch'),
    coalesce(nullif(btrim(p_purpose), ''), 'resale'),
    'acquired',
    btrim(p_title),
    coalesce(p_notes, '')
  )
  returning * into v_item;

  return v_item;
end;
$$;

grant execute on function public.create_item(uuid,text,text,text,text) to authenticated;
