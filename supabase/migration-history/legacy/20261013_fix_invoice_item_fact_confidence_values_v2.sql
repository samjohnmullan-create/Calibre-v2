do $$
declare
  v_def text;
  v_old text := 'case when coalesce(v_line.confidence,0) >= 0.9 then ''high'' when coalesce(v_line.confidence,0) >= 0.7 then ''medium'' else ''low'' end';
  v_new text := 'case when coalesce(v_line.confidence,0) >= 0.9 then ''confirmed'' when coalesce(v_line.confidence,0) >= 0.8 then ''strong'' when coalesce(v_line.confidence,0) >= 0.6 then ''probable'' when coalesce(v_line.confidence,0) >= 0.4 then ''possible'' else ''unknown'' end';
begin
  select pg_get_functiondef(p.oid)
  into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'import_acquisition_invoice'
    and pg_get_function_identity_arguments(p.oid) = 'p_workspace_id uuid, p_invoice_id uuid';

  if v_def is null then
    raise exception 'import_acquisition_invoice(uuid, uuid) was not found';
  end if;

  v_def := replace(v_def, v_old, v_new);
  execute v_def;
end
$$;
