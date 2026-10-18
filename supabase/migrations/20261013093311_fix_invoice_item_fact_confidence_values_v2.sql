do $do$
declare
  v_def text;
begin
  select pg_get_functiondef('public.import_acquisition_invoice(uuid,uuid)'::regprocedure) into v_def;
  v_def := replace(
    v_def,
    $$then 'high' when coalesce(v_line.confidence,0) >= 0.7 then 'medium' else 'low' end$$,
    $$then 'confirmed' when coalesce(v_line.confidence,0) >= 0.8 then 'strong' when coalesce(v_line.confidence,0) >= 0.6 then 'probable' when coalesce(v_line.confidence,0) >= 0.4 then 'possible' else 'unknown' end$$
  );
  execute v_def;
end
$do$;