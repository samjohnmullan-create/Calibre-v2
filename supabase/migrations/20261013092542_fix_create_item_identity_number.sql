create or replace function public.create_item(
  p_workspace_id uuid,
  p_title text,
  p_type text default 'watch'::text,
  p_purpose text default 'resale'::text,
  p_notes text default ''::text
)
returns public.items
language plpgsql
set search_path to 'public'
as $function$
declare
  v_item public.items;
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

  insert into public.items (
    workspace_id, type, purpose, status, title, notes
  ) values (
    p_workspace_id,
    coalesce(nullif(btrim(p_type), ''), 'watch'),
    coalesce(nullif(btrim(p_purpose), ''), 'resale'),
    'acquired',
    btrim(p_title),
    coalesce(p_notes, '')
  )
  returning * into v_item;

  return v_item;
end;
$function$;
