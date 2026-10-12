create table if not exists public.knowledge_dataset_records (
  id uuid primary key default gen_random_uuid(),
  import_batch text not null,
  dataset_name text not null,
  source_record_id text not null,
  payload jsonb not null,
  origin_kind text not null default 'documented',
  verification_status text not null default 'candidate',
  created_at timestamptz not null default now(),
  unique(import_batch, dataset_name, source_record_id)
);

alter table public.knowledge_dataset_records enable row level security;
create policy "knowledge_dataset_records_read" on public.knowledge_dataset_records for select using (true);
create policy "knowledge_dataset_records_manage" on public.knowledge_dataset_records for all
  using (exists (select 1 from public.workspaces w where w.owner_id = auth.uid()))
  with check (exists (select 1 from public.workspaces w where w.owner_id = auth.uid()));

create index if not exists knowledge_dataset_records_dataset_idx on public.knowledge_dataset_records(dataset_name, import_batch);

create or replace function public.knowledge_origin_for_record(p_dataset text, p_record jsonb)
returns text
language sql
immutable
as $$
  select case
    when lower(coalesce(p_record->>'source_type','')) = 'generated series' then 'generated'
    when lower(coalesce(p_record->>'title','')) like '%doubling%' then 'generated'
    when lower(coalesce(p_record->>'notes','')) like '%generated from known manufacturer series patterns%' then 'generated'
    when lower(coalesce(p_record->>'notes','')) like '%bulk generation%' then 'generated'
    when p_dataset in ('dimensional_candidates') then 'inferred'
    when p_dataset in ('identification_signals') and coalesce(p_record->>'source_url','') = '' then 'derived'
    else 'documented'
  end;
$$;

create or replace function public.begin_knowledge_import(
  p_batch_key text,
  p_engine_name text,
  p_engine_version text,
  p_source_filename text,
  p_source_hash text default '',
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security invoker
as $$
declare v_id uuid;
begin
  insert into public.knowledge_import_batches(batch_key, engine_name, engine_version, source_filename, source_hash, metadata, notes)
  values (p_batch_key, p_engine_name, p_engine_version, p_source_filename, p_source_hash, p_metadata, 'Import started')
  on conflict (batch_key) do update set
    engine_name=excluded.engine_name,
    engine_version=excluded.engine_version,
    source_filename=excluded.source_filename,
    source_hash=excluded.source_hash,
    metadata=excluded.metadata,
    notes='Import resumed'
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.import_knowledge_chunk(
  p_batch_key text,
  p_dataset_name text,
  p_records jsonb
) returns jsonb
language plpgsql
security invoker
as $$
declare
  r jsonb;
  v_count int := 0;
  v_origin text;
  v_source_id uuid;
  v_family_name text;
  v_movement_id uuid;
  v_part_id uuid;
  v_movement_b_id uuid;
  v_reliability text;
begin
  if jsonb_typeof(p_records) <> 'array' then raise exception 'p_records must be a JSON array'; end if;
  if not exists (select 1 from public.knowledge_import_batches where batch_key=p_batch_key) then raise exception 'Unknown import batch %', p_batch_key; end if;

  for r in select value from jsonb_array_elements(p_records)
  loop
    v_count := v_count + 1;
    v_origin := public.knowledge_origin_for_record(p_dataset_name, r);

    insert into public.knowledge_dataset_records(import_batch,dataset_name,source_record_id,payload,origin_kind,verification_status)
    values (p_batch_key,p_dataset_name,coalesce(r->>'id', md5(r::text)),r,v_origin,
      case when v_origin='documented' then 'reviewed' else 'candidate' end)
    on conflict (import_batch,dataset_name,source_record_id) do update set payload=excluded.payload,origin_kind=excluded.origin_kind,verification_status=excluded.verification_status;

    if p_dataset_name='sources' then
      v_reliability := case
        when v_origin='generated' then 'low'
        when lower(coalesce(r->>'source_type','')) like '%technical%' then 'high'
        when lower(coalesce(r->>'source_type','')) like '%historical%' then 'high'
        when lower(coalesce(r->>'source_type','')) like '%catalog%' then 'high'
        when lower(coalesce(r->>'source_type','')) like '%database%' then 'medium'
        else 'unknown' end;
      insert into public.knowledge_sources(title,source_type,publisher,url,reference_text,reliability,accessed_date,source_record_id,origin_kind,verification_status,import_batch)
      values (coalesce(r->>'title',''),coalesce(r->>'source_type',''),'',coalesce(r->>'url',''),coalesce(r->>'notes',''),v_reliability,nullif(r->>'accessed_date','')::date,r->>'id',v_origin,case when v_origin='documented' then 'reviewed' else 'candidate' end,p_batch_key)
      on conflict do nothing;

    elsif p_dataset_name='families' then
      insert into public.knowledge_families(maker,family_name,notes,source_record_id,origin_kind,verification_status,evidence_grade,import_batch)
      values (coalesce(r->>'maker',''),coalesce(r->>'family_name',''),coalesce(r->>'notes',''),r->>'id',v_origin,case when v_origin='documented' then 'reviewed' else 'candidate' end,case when v_origin='documented' then 'documented' else 'candidate' end,p_batch_key)
      on conflict (maker,family_name) do update set notes=excluded.notes,source_record_id=excluded.source_record_id,origin_kind=excluded.origin_kind,verification_status=excluded.verification_status,evidence_grade=excluded.evidence_grade,import_batch=excluded.import_batch,updated_at=now();

    elsif p_dataset_name='calibres' then
      select family_name into v_family_name from public.knowledge_families where import_batch=p_batch_key and source_record_id=r->>'family_id' limit 1;
      select id into v_source_id from public.knowledge_sources where import_batch=p_batch_key and source_record_id=r->>'source_id' limit 1;
      if v_source_id is not null then select origin_kind into v_origin from public.knowledge_sources where id=v_source_id; end if;
      insert into public.knowledge_movements(maker,calibre,calibre_family,diameter_mm,bph,escapement,notes,winding,height_mm,layout,search_aliases,common_brands,primary_source_id,source_record_id,origin_kind,verification_status,evidence_grade,import_batch)
      values (coalesce(r->>'maker',''),coalesce(r->>'calibre',''),coalesce(v_family_name,''),nullif(r->>'diameter_mm','')::numeric,nullif(r->>'beat_rate_bph','')::int,'',coalesce(r->>'notes',''),coalesce(r->>'winding',''),nullif(r->>'height_mm','')::numeric,coalesce(r->>'layout',''),coalesce(r->'search_aliases','[]'::jsonb),coalesce(r->'common_brands','[]'::jsonb),v_source_id,r->>'id',coalesce(v_origin,'documented'),case when v_origin='documented' then 'reviewed' else 'candidate' end,case when v_origin='documented' then 'documented' else 'candidate' end,p_batch_key)
      on conflict (maker,calibre) do update set calibre_family=excluded.calibre_family,diameter_mm=coalesce(excluded.diameter_mm,knowledge_movements.diameter_mm),bph=coalesce(excluded.bph,knowledge_movements.bph),notes=case when excluded.notes<>'' then excluded.notes else knowledge_movements.notes end,winding=case when excluded.winding<>'' then excluded.winding else knowledge_movements.winding end,height_mm=coalesce(excluded.height_mm,knowledge_movements.height_mm),layout=case when excluded.layout<>'' then excluded.layout else knowledge_movements.layout end,search_aliases=excluded.search_aliases,common_brands=excluded.common_brands,primary_source_id=coalesce(excluded.primary_source_id,knowledge_movements.primary_source_id),source_record_id=excluded.source_record_id,origin_kind=excluded.origin_kind,verification_status=excluded.verification_status,evidence_grade=excluded.evidence_grade,import_batch=excluded.import_batch,updated_at=now();
      if v_source_id is not null then
        select id into v_movement_id from public.knowledge_movements where maker=coalesce(r->>'maker','') and calibre=coalesce(r->>'calibre','');
        insert into public.knowledge_movement_sources(movement_id,source_id,evidence_class,notes)
        values(v_movement_id,v_source_id,case when v_origin='documented' then 'documented' else 'inferred' end,'Imported from Calibre Knowledge Engine '||p_batch_key)
        on conflict do nothing;
      end if;

    elsif p_dataset_name='part_references' then
      insert into public.knowledge_part_refs(manufacturer,part_type,part_reference,description,notes,source_record_id,origin_kind,verification_status,evidence_grade,import_batch)
      values(coalesce(r->>'manufacturer',''),coalesce(r->>'part_type',''),coalesce(r->>'reference',''),coalesce(r->>'notes',''),coalesce(r->>'notes',''),r->>'id',v_origin,case when v_origin='documented' then 'reviewed' else 'candidate' end,case when v_origin='documented' then 'documented' else 'candidate' end,p_batch_key)
      on conflict do nothing;

    elsif p_dataset_name='calibre_part_refs' then
      select id into v_movement_id from public.knowledge_movements where import_batch=p_batch_key and source_record_id=r->>'calibre_id' limit 1;
      if v_movement_id is null then select id into v_movement_id from public.knowledge_movements where source_record_id=r->>'calibre_id' order by updated_at desc limit 1; end if;
      select id into v_part_id from public.knowledge_part_refs where import_batch=p_batch_key and source_record_id=r->>'part_ref_id' limit 1;
      select id into v_source_id from public.knowledge_sources where import_batch=p_batch_key and source_record_id=r->>'source_id' limit 1;
      if v_movement_id is not null and v_part_id is not null then
        insert into public.knowledge_part_applications(part_ref_id,movement_id,serial_from,serial_to,evidence_class,source_id,notes,confidence,source_record_id,origin_kind,verification_status,import_batch)
        values(v_part_id,v_movement_id,'','',case lower(coalesce(r->>'confidence','')) when 'confirmed' then 'documented' else 'inferred' end,v_source_id,coalesce(r->>'notes',''),case lower(coalesce(r->>'confidence','')) when 'confirmed' then 0.95 when 'high' then 0.85 else null end,md5(r::text),case when v_source_id is not null then 'documented' else 'inferred' end,case when lower(coalesce(r->>'confidence',''))='confirmed' then 'reviewed' else 'candidate' end,p_batch_key)
        on conflict (part_ref_id,movement_id,serial_from,serial_to) do update set evidence_class=excluded.evidence_class,source_id=excluded.source_id,notes=excluded.notes,confidence=excluded.confidence,origin_kind=excluded.origin_kind,verification_status=excluded.verification_status,import_batch=excluded.import_batch;
      end if;

    elsif p_dataset_name='compatibility_edges' then
      select id into v_movement_id from public.knowledge_movements where import_batch=p_batch_key and source_record_id=r->>'calibre_a_id' limit 1;
      select id into v_movement_b_id from public.knowledge_movements where import_batch=p_batch_key and source_record_id=r->>'calibre_b_id' limit 1;
      select id into v_source_id from public.knowledge_sources where import_batch=p_batch_key and source_record_id=r->>'source_id' limit 1;
      v_origin := case when v_source_id is not null then 'documented' else 'inferred' end;
      if v_movement_id is not null and v_movement_b_id is not null then
        insert into public.knowledge_compatibility_edges(movement_a_id,movement_b_id,scope,status,confidence,modification_required,notes,source_id,source_record_id,origin_kind,verification_status,evidence_grade,import_batch)
        values(v_movement_id,v_movement_b_id,coalesce(r->>'scope',''),coalesce(r->>'status',''),nullif(r->>'confidence','')::numeric,coalesce((r->>'modification_required')::int,0)<>0,coalesce(r->>'notes',''),v_source_id,r->>'id',v_origin,case when v_source_id is not null then 'reviewed' else 'candidate' end,case when v_source_id is not null then 'documented' else 'candidate' end,p_batch_key)
        on conflict (movement_a_id,movement_b_id,scope,status) do update set confidence=excluded.confidence,modification_required=excluded.modification_required,notes=excluded.notes,source_id=excluded.source_id,origin_kind=excluded.origin_kind,verification_status=excluded.verification_status,evidence_grade=excluded.evidence_grade,import_batch=excluded.import_batch;
      end if;

    elsif p_dataset_name='movement_specs' then
      select id into v_movement_id from public.knowledge_movements where import_batch=p_batch_key and source_record_id=r->>'calibre_id' limit 1;
      if v_movement_id is not null then
        update public.knowledge_movements set
          diameter_mm=coalesce(nullif(r->>'diameter_mm','')::numeric,diameter_mm),
          height_mm=coalesce(nullif(r->>'height_mm','')::numeric,height_mm),
          jewels=coalesce(nullif(r->>'jewels','')::int,jewels),
          power_reserve_hours=coalesce(nullif(r->>'power_reserve_h','')::numeric,power_reserve_hours),
          bph=coalesce(nullif(r->>'beat_rate_bph','')::int,bph),
          lift_angle_deg=coalesce(nullif(r->>'lift_angle_deg','')::numeric,lift_angle_deg),
          winding=case when coalesce(r->>'winding_type','')<>'' then r->>'winding_type' else winding end,
          notes=case when coalesce(r->>'notes','')<>'' then concat_ws(' | ',nullif(notes,''),r->>'notes') else notes end,
          updated_at=now()
        where id=v_movement_id;
      end if;

    elsif p_dataset_name='identification_signals' then
      select id into v_movement_id from public.knowledge_movements where import_batch=p_batch_key and source_record_id=r->>'calibre_id' limit 1;
      if v_movement_id is not null then
        insert into public.knowledge_identification_signals(movement_id,signal_type,signal_value,weight,source_url,notes,source_record_id,origin_kind,verification_status,import_batch)
        values(v_movement_id,coalesce(r->>'signal_type',''),coalesce(r->>'signal_value',''),coalesce(nullif(r->>'weight','')::numeric,1),coalesce(r->>'source_url',''),coalesce(r->>'notes',''),r->>'id',case when coalesce(r->>'source_url','')='' then 'derived' else 'documented' end,case when coalesce(r->>'source_url','')='' then 'candidate' else 'reviewed' end,p_batch_key)
        on conflict do nothing;
      end if;

    elsif p_dataset_name='technical_documents' then
      select id into v_source_id from public.knowledge_sources where url=coalesce(r->>'landing_url','') order by updated_at desc limit 1;
      insert into public.knowledge_technical_documents(title,document_type,url,reference_text,source_id,notes,source_record_id,origin_kind,verification_status,import_batch)
      values(coalesce(r->>'title',''),coalesce(r->>'document_type',''),coalesce(r->>'landing_url',''),concat_ws(' · ',nullif(r->>'maker',''),nullif(r->>'calibre_scope','')),v_source_id,coalesce(r->>'notes',''),r->>'id','documented','reviewed',p_batch_key)
      on conflict do nothing;

    elsif p_dataset_name='knowledge_rules' then
      insert into public.knowledge_rules(rule_key,rule_text,severity,applies_to,active,import_batch)
      values(coalesce(r->>'rule_key',''),coalesce(r->>'rule_text',''),coalesce(r->>'severity','warning'),coalesce(r->>'applies_to','knowledge'),true,p_batch_key)
      on conflict(rule_key) do update set rule_text=excluded.rule_text,severity=excluded.severity,applies_to=excluded.applies_to,active=true,import_batch=excluded.import_batch,updated_at=now();
    end if;

    v_source_id := null; v_family_name := null; v_movement_id := null; v_movement_b_id := null; v_part_id := null;
  end loop;

  return jsonb_build_object('dataset',p_dataset_name,'processed',v_count);
end;
$$;

create or replace function public.finalize_knowledge_import(p_batch_key text)
returns jsonb
language plpgsql
security invoker
as $$
declare v_summary jsonb;
begin
  select jsonb_object_agg(dataset_name,cnt) into v_summary from (
    select dataset_name,count(*) cnt from public.knowledge_dataset_records where import_batch=p_batch_key group by dataset_name
  ) s;
  update public.knowledge_import_batches set notes='Import complete', metadata=metadata || jsonb_build_object('dataset_counts',coalesce(v_summary,'{}'::jsonb)) where batch_key=p_batch_key;
  return coalesce(v_summary,'{}'::jsonb);
end;
$$;
