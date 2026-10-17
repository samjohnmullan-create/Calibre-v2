alter table public.acquisition_invoice_lines
  add column if not exists attributes jsonb not null default '{}'::jsonb;

create or replace function public.import_acquisition_invoice(p_workspace_id uuid, p_invoice_id uuid)
returns table(created_count integer, created_item_ids uuid[])
language plpgsql
set search_path to 'public'
as $function$
declare
  v_invoice public.acquisition_invoices%rowtype;
  v_line public.acquisition_invoice_lines%rowtype;
  v_item public.items;
  v_count integer := 0;
  v_ids uuid[] := '{}'::uuid[];
  v_notes text;
  v_attrs jsonb;
  v_key text;
  v_value jsonb;
  v_fact jsonb;
begin
  if not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner','editor')
  ) then
    raise exception 'Not authorised for this workspace';
  end if;

  select * into v_invoice
  from public.acquisition_invoices
  where id = p_invoice_id and workspace_id = p_workspace_id
  for update;

  if not found then raise exception 'Invoice not found'; end if;

  for v_line in
    select * from public.acquisition_invoice_lines
    where workspace_id = p_workspace_id
      and invoice_id = p_invoice_id
      and include_on_import = true
      and created_item_id is null
    order by line_number nulls last, created_at
  loop
    if nullif(btrim(v_line.proposed_title), '') is null then
      raise exception 'Every included draft line needs a title before import';
    end if;

    v_attrs := coalesce(v_line.attributes, '{}'::jsonb);
    v_notes := concat_ws(E'\n',
      nullif('Invoice source: ' || nullif(btrim(v_invoice.vendor_name), ''), 'Invoice source: '),
      case when nullif(btrim(v_invoice.invoice_number), '') is not null then 'Invoice: ' || btrim(v_invoice.invoice_number) end,
      case when nullif(btrim(v_line.lot_number), '') is not null then 'Lot: ' || btrim(v_line.lot_number) end,
      case when nullif(btrim(v_line.raw_text), '') is not null then 'Invoice description: ' || btrim(v_line.raw_text) end,
      case when nullif(btrim(v_line.review_note), '') is not null then 'Intake note: ' || btrim(v_line.review_note) end
    );

    select * into v_item from public.create_item(
      p_workspace_id,
      btrim(v_line.proposed_title),
      coalesce(nullif(btrim(v_line.proposed_type), ''), 'other'),
      coalesce(nullif(btrim(v_line.proposed_purpose), ''), 'resale'),
      coalesce(v_notes, '')
    );

    if v_invoice.invoice_date is not null then
      update public.items set acquired_at = v_invoice.invoice_date, updated_at = now()
      where id = v_item.id and workspace_id = p_workspace_id;
    end if;

    insert into public.item_identity (
      item_id, workspace_id, maker, model, reference, serial, year_from, year_to, era, country,
      materials, dimensions_text, weight_grams, dial_markings, case_markings, movement_markings, notes, updated_at
    ) values (
      v_item.id, p_workspace_id,
      coalesce(v_attrs->>'maker',''), coalesce(v_attrs->>'model',''), coalesce(v_attrs->>'reference',''), coalesce(v_attrs->>'serial',''),
      case when (v_attrs->>'year') ~ '^\d{4}$' then (v_attrs->>'year')::int else null end,
      case when (v_attrs->>'year') ~ '^\d{4}$' then (v_attrs->>'year')::int else null end,
      coalesce(v_attrs->>'era',''), coalesce(v_attrs->>'country',''), coalesce(v_attrs->>'materials',''),
      coalesce(v_attrs->>'dimensions_text',''),
      case when (v_attrs->>'weight_grams') ~ '^\d+(\.\d+)?$' then (v_attrs->>'weight_grams')::numeric else null end,
      coalesce(v_attrs->>'dial_markings',''), coalesce(v_attrs->>'case_markings',''), coalesce(v_attrs->>'movement_markings',''),
      'Imported from acquisition invoice', now()
    )
    on conflict (item_id) do update set
      maker = excluded.maker, model = excluded.model, reference = excluded.reference, serial = excluded.serial,
      year_from = excluded.year_from, year_to = excluded.year_to, era = excluded.era, country = excluded.country,
      materials = excluded.materials, dimensions_text = excluded.dimensions_text, weight_grams = excluded.weight_grams,
      dial_markings = excluded.dial_markings, case_markings = excluded.case_markings,
      movement_markings = excluded.movement_markings, updated_at = now();

    if coalesce(v_line.proposed_type,'') = 'watch' then
      insert into public.passports (
        item_id, workspace_id, movement_maker, calibre, calibre_family, jewels, beat_rate, power_reserve_hours,
        escapement, movement_diameter_mm, movement_type, setting_system, complications, case_material, case_style,
        caseback_type, crystal_type, crown_type, lug_width_mm, width_mm, height_mm, thickness_mm,
        water_resistance_marking, hallmarks, provenance_summary, technical_notes, movement_identification_status, updated_at
      ) values (
        v_item.id, p_workspace_id,
        coalesce(v_attrs->>'movement_maker',''), coalesce(v_attrs->>'calibre',''), coalesce(v_attrs->>'calibre_family',''),
        case when (v_attrs->>'jewels') ~ '^\d+$' then (v_attrs->>'jewels')::int else null end,
        case when (v_attrs->>'beat_rate') ~ '^\d+$' then (v_attrs->>'beat_rate')::int else null end,
        case when (v_attrs->>'power_reserve_hours') ~ '^\d+(\.\d+)?$' then (v_attrs->>'power_reserve_hours')::numeric else null end,
        coalesce(v_attrs->>'escapement',''),
        case when (v_attrs->>'movement_diameter_mm') ~ '^\d+(\.\d+)?$' then (v_attrs->>'movement_diameter_mm')::numeric else null end,
        coalesce(v_attrs->>'movement_type',''), coalesce(v_attrs->>'setting_system',''),
        case when jsonb_typeof(v_attrs->'complications')='array' then array(select jsonb_array_elements_text(v_attrs->'complications')) else '{}'::text[] end,
        coalesce(v_attrs->>'case_material',''), coalesce(v_attrs->>'case_style',''), coalesce(v_attrs->>'caseback_type',''),
        coalesce(v_attrs->>'crystal_type',''), coalesce(v_attrs->>'crown_type',''),
        case when (v_attrs->>'lug_width_mm') ~ '^\d+(\.\d+)?$' then (v_attrs->>'lug_width_mm')::numeric else null end,
        case when (v_attrs->>'width_mm') ~ '^\d+(\.\d+)?$' then (v_attrs->>'width_mm')::numeric else null end,
        case when (v_attrs->>'height_mm') ~ '^\d+(\.\d+)?$' then (v_attrs->>'height_mm')::numeric else null end,
        case when (v_attrs->>'thickness_mm') ~ '^\d+(\.\d+)?$' then (v_attrs->>'thickness_mm')::numeric else null end,
        coalesce(v_attrs->>'water_resistance_marking',''), coalesce(v_attrs->>'hallmarks',''),
        concat_ws(' · ', nullif(btrim(v_invoice.vendor_name),''), case when nullif(btrim(v_invoice.invoice_number),'') is not null then 'Invoice '||btrim(v_invoice.invoice_number) end),
        concat_ws(E'\n', nullif(v_attrs->>'technical_notes',''), nullif(v_attrs->>'condition',''), nullif(v_attrs->>'working_status','')),
        case when nullif(v_attrs->>'calibre','') is not null or nullif(v_attrs->>'movement_maker','') is not null then 'candidate' else 'unlinked' end,
        now()
      ) on conflict (item_id) do update set
        movement_maker=excluded.movement_maker, calibre=excluded.calibre, calibre_family=excluded.calibre_family,
        jewels=excluded.jewels, beat_rate=excluded.beat_rate, power_reserve_hours=excluded.power_reserve_hours,
        escapement=excluded.escapement, movement_diameter_mm=excluded.movement_diameter_mm, movement_type=excluded.movement_type,
        setting_system=excluded.setting_system, complications=excluded.complications, case_material=excluded.case_material,
        case_style=excluded.case_style, caseback_type=excluded.caseback_type, crystal_type=excluded.crystal_type,
        crown_type=excluded.crown_type, lug_width_mm=excluded.lug_width_mm, width_mm=excluded.width_mm,
        height_mm=excluded.height_mm, thickness_mm=excluded.thickness_mm, water_resistance_marking=excluded.water_resistance_marking,
        hallmarks=excluded.hallmarks, provenance_summary=excluded.provenance_summary, technical_notes=excluded.technical_notes,
        movement_identification_status=excluded.movement_identification_status, updated_at=now();
    end if;

    for v_key, v_value in select key, value from jsonb_each(v_attrs - 'extra_facts' - 'complications')
    loop
      if v_value is not null and v_value <> 'null'::jsonb and trim(both '"' from v_value::text) <> '' then
        insert into public.item_facts(workspace_id,item_id,fact_type,value_text,confidence,status,evidence_note)
        values(p_workspace_id,v_item.id,v_key,trim(both '"' from v_value::text),
          case when coalesce(v_line.confidence,0) >= 0.9 then 'high' when coalesce(v_line.confidence,0) >= 0.7 then 'medium' else 'low' end,
          'active','Extracted from acquisition invoice');
      end if;
    end loop;

    if jsonb_typeof(v_attrs->'extra_facts')='array' then
      for v_fact in select value from jsonb_array_elements(v_attrs->'extra_facts')
      loop
        if nullif(btrim(v_fact->>'key'),'') is not null and nullif(btrim(v_fact->>'value'),'') is not null then
          insert into public.item_facts(workspace_id,item_id,fact_type,value_text,confidence,status,evidence_note)
          values(p_workspace_id,v_item.id,btrim(v_fact->>'key'),btrim(v_fact->>'value'),
            case when coalesce(v_line.confidence,0) >= 0.9 then 'high' when coalesce(v_line.confidence,0) >= 0.7 then 'medium' else 'low' end,
            'active','Extracted from acquisition invoice');
        end if;
      end loop;
    end if;

    insert into public.media_assets (
      workspace_id, item_id, category, role, storage_path, original_filename, mime_type, byte_size, caption, is_cover
    ) values (
      p_workspace_id, v_item.id, 'invoice', 'source_invoice', v_invoice.storage_path,
      v_invoice.original_filename, v_invoice.mime_type, v_invoice.byte_size,
      concat_ws(' · ', nullif(btrim(v_invoice.vendor_name), ''), case when nullif(btrim(v_invoice.invoice_number), '') is not null then 'Invoice ' || btrim(v_invoice.invoice_number) end),
      false
    );

    update public.acquisition_invoice_lines
    set created_item_id = v_item.id, updated_at = now()
    where id = v_line.id and workspace_id = p_workspace_id;

    v_count := v_count + 1;
    v_ids := array_append(v_ids, v_item.id);
  end loop;

  if v_count > 0 then
    update public.acquisition_invoices set extraction_status='imported', updated_at=now()
    where id=p_invoice_id and workspace_id=p_workspace_id;
  end if;

  created_count := v_count;
  created_item_ids := v_ids;
  return next;
end;
$function$;
