create or replace function private.route_completed_research_to_knowledge()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_movement_id uuid;
  v_maker text;
  v_calibre text;
  v_batch text := 'research:' || new.id::text;
begin
  if new.status is distinct from 'complete' or old.status = 'complete' then
    return new;
  end if;

  -- Every research source becomes candidate Knowledge source material.
  insert into public.knowledge_sources (
    title, source_type, publisher, url, reference_text, reliability,
    accessed_date, source_record_id, origin_kind, verification_status, import_batch
  )
  select distinct
    s.title,
    s.source_type,
    coalesce(s.publisher, ''),
    coalesce(s.url, ''),
    coalesce(s.reference_text, ''),
    coalesce(s.reliability, 'unknown'),
    current_date,
    'research-source:' || s.id::text,
    'generated',
    'candidate',
    v_batch
  from public.research_findings rf
  join public.research_finding_sources rfs on rfs.research_finding_id = rf.id
  join public.sources s on s.id = rfs.source_id
  where rf.research_request_id = new.id
    and not exists (
      select 1 from public.knowledge_sources ks
      where ks.source_record_id = 'research-source:' || s.id::text
    );

  -- Every finding enters the Knowledge dataset, even if it cannot yet be safely normalized.
  insert into public.knowledge_dataset_records (
    import_batch, dataset_name, source_record_id, payload, origin_kind, verification_status
  )
  select
    v_batch,
    case
      when lower(rf.category) like '%part%' then 'research_parts_candidate'
      when lower(rf.category) like '%movement%' or lower(rf.category) like '%calibre%' or lower(rf.category) like '%technical%' then 'research_movement_candidate'
      when lower(rf.category) like '%market%' or lower(rf.category) like '%valuation%' or lower(rf.category) like '%price%' then 'research_market_candidate'
      when lower(rf.category) like '%document%' or lower(rf.category) like '%manual%' then 'research_document_candidate'
      else 'research_finding_candidate'
    end,
    'research-finding:' || rf.id::text,
    jsonb_build_object(
      'research_request_id', rf.research_request_id,
      'item_id', rf.item_id,
      'category', rf.category,
      'finding', rf.finding,
      'confidence', rf.confidence,
      'evidence_note', rf.evidence_note,
      'proposed_destination', rf.proposed_destination,
      'proposed_field', rf.proposed_field,
      'proposed_value', rf.proposed_value,
      'sources', coalesce((
        select jsonb_agg(jsonb_build_object(
          'title', s2.title,
          'publisher', s2.publisher,
          'url', s2.url,
          'source_type', s2.source_type,
          'reliability', s2.reliability
        ))
        from public.research_finding_sources rfs2
        join public.sources s2 on s2.id = rfs2.source_id
        where rfs2.research_finding_id = rf.id
      ), '[]'::jsonb)
    ),
    'generated',
    'candidate'
  from public.research_findings rf
  where rf.research_request_id = new.id
    and not exists (
      select 1 from public.knowledge_dataset_records kdr
      where kdr.source_record_id = 'research-finding:' || rf.id::text
    );

  -- Resolve the Item's movement without changing canonical Passport identity.
  select p.knowledge_movement_id, nullif(trim(p.movement_maker), ''), nullif(trim(p.calibre), '')
    into v_movement_id, v_maker, v_calibre
  from public.passports p
  where p.item_id = new.item_id
  limit 1;

  if v_movement_id is null and v_maker is not null and v_calibre is not null then
    select km.id into v_movement_id
    from public.knowledge_movements km
    where lower(km.maker) = lower(v_maker)
      and lower(km.calibre) = lower(v_calibre)
    limit 1;

    if v_movement_id is null then
      insert into public.knowledge_movements (
        maker, calibre, origin_kind, verification_status, evidence_grade,
        source_record_id, import_batch, notes
      ) values (
        v_maker, v_calibre, 'generated', 'candidate', 'candidate',
        'research-movement:' || new.item_id::text,
        v_batch,
        'Candidate movement identity created from autonomous research context. Requires review.'
      )
      returning id into v_movement_id;
    end if;
  end if;

  if v_movement_id is not null then
    -- Link research sources to Movement Knowledge.
    insert into public.knowledge_movement_sources (
      movement_id, source_id, evidence_class, reference_text, notes
    )
    select distinct
      v_movement_id,
      ks.id,
      case
        when ks.source_type in ('manufacturer','catalogue','book','document') and ks.reliability in ('primary','high') then 'documented'
        else 'inferred'
      end,
      coalesce(ks.reference_text, ''),
      'Autonomous research evidence · request ' || new.id::text
    from public.research_findings rf
    join public.research_finding_sources rfs on rfs.research_finding_id = rf.id
    join public.sources s on s.id = rfs.source_id
    join public.knowledge_sources ks on ks.source_record_id = 'research-source:' || s.id::text
    where rf.research_request_id = new.id
      and not exists (
        select 1 from public.knowledge_movement_sources kms
        where kms.movement_id = v_movement_id and kms.source_id = ks.id
      );

    -- Candidate movement rows may be enriched only where values are still blank.
    update public.knowledge_movements km
    set
      calibre_family = coalesce(km.calibre_family, (
        select rf.proposed_value #>> '{}'
        from public.research_findings rf
        where rf.research_request_id = new.id and rf.proposed_destination = 'passport' and rf.proposed_field = 'calibre_family'
        order by rf.created_at desc limit 1
      )),
      diameter_mm = coalesce(km.diameter_mm, (
        select case when (rf.proposed_value #>> '{}') ~ '^[0-9]+(\.[0-9]+)?$' then (rf.proposed_value #>> '{}')::numeric end
        from public.research_findings rf
        where rf.research_request_id = new.id and rf.proposed_destination = 'passport' and rf.proposed_field = 'movement_diameter_mm'
        order by rf.created_at desc limit 1
      )),
      jewels = coalesce(km.jewels, (
        select case when (rf.proposed_value #>> '{}') ~ '^[0-9]+$' then (rf.proposed_value #>> '{}')::integer end
        from public.research_findings rf
        where rf.research_request_id = new.id and rf.proposed_destination = 'passport' and rf.proposed_field = 'jewels'
        order by rf.created_at desc limit 1
      )),
      bph = coalesce(km.bph, (
        select case when (rf.proposed_value #>> '{}') ~ '^[0-9]+$' then (rf.proposed_value #>> '{}')::integer end
        from public.research_findings rf
        where rf.research_request_id = new.id and rf.proposed_destination = 'passport' and rf.proposed_field = 'beat_rate'
        order by rf.created_at desc limit 1
      )),
      escapement = coalesce(km.escapement, (
        select rf.proposed_value #>> '{}'
        from public.research_findings rf
        where rf.research_request_id = new.id and rf.proposed_destination = 'passport' and rf.proposed_field = 'escapement'
        order by rf.created_at desc limit 1
      )),
      power_reserve_hours = coalesce(km.power_reserve_hours, (
        select case when (rf.proposed_value #>> '{}') ~ '^[0-9]+(\.[0-9]+)?$' then (rf.proposed_value #>> '{}')::numeric end
        from public.research_findings rf
        where rf.research_request_id = new.id and rf.proposed_destination = 'passport' and rf.proposed_field = 'power_reserve_hours'
        order by rf.created_at desc limit 1
      )),
      updated_at = now()
    where km.id = v_movement_id
      and km.verification_status = 'candidate';
  end if;

  -- Document-like research sources enter the technical library as candidate records.
  insert into public.knowledge_technical_documents (
    movement_id, title, document_type, url, reference_text, source_id,
    notes, source_record_id, origin_kind, verification_status, import_batch
  )
  select distinct
    v_movement_id,
    ks.title,
    case when ks.source_type = 'book' then 'book' when ks.source_type = 'catalogue' then 'catalogue' else 'document' end,
    coalesce(ks.url, ''),
    coalesce(ks.reference_text, ''),
    ks.id,
    'Candidate technical document discovered by autonomous research. Requires review.',
    'research-document:' || s.id::text,
    'generated',
    'candidate',
    v_batch
  from public.research_findings rf
  join public.research_finding_sources rfs on rfs.research_finding_id = rf.id
  join public.sources s on s.id = rfs.source_id
  join public.knowledge_sources ks on ks.source_record_id = 'research-source:' || s.id::text
  where rf.research_request_id = new.id
    and (
      ks.source_type in ('document','book','catalogue')
      or lower(coalesce(ks.url, '')) ~ '\.pdf([?#].*)?$'
    )
    and not exists (
      select 1 from public.knowledge_technical_documents ktd
      where ktd.source_record_id = 'research-document:' || s.id::text
    );

  return new;
end;
$$;

comment on function private.route_completed_research_to_knowledge() is
'Routes completed autonomous research into candidate Knowledge sources, dataset records, movement evidence, movement specs, and technical documents without overwriting reviewed canonical knowledge.';

drop trigger if exists research_requests_route_to_knowledge on public.research_requests;
create trigger research_requests_route_to_knowledge
after update of status on public.research_requests
for each row
when (new.status = 'complete' and old.status is distinct from 'complete')
execute function private.route_completed_research_to_knowledge();
