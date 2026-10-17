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
begin
  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner','editor')
  ) then
    raise exception 'Not authorised for this workspace';
  end if;

  select * into v_invoice
  from public.acquisition_invoices
  where id = p_invoice_id
    and workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'Invoice not found';
  end if;

  for v_line in
    select *
    from public.acquisition_invoice_lines
    where workspace_id = p_workspace_id
      and invoice_id = p_invoice_id
      and include_on_import = true
      and created_item_id is null
    order by line_number nulls last, created_at
  loop
    if nullif(btrim(v_line.proposed_title), '') is null then
      raise exception 'Every included draft line needs a title before import';
    end if;

    v_notes := concat_ws(E'\n',
      nullif('Invoice source: ' || nullif(btrim(v_invoice.vendor_name), ''), 'Invoice source: '),
      case when nullif(btrim(v_invoice.invoice_number), '') is not null then 'Invoice: ' || btrim(v_invoice.invoice_number) end,
      case when nullif(btrim(v_line.lot_number), '') is not null then 'Lot: ' || btrim(v_line.lot_number) end,
      case when nullif(btrim(v_line.raw_text), '') is not null then 'Invoice description: ' || btrim(v_line.raw_text) end,
      case when nullif(btrim(v_line.review_note), '') is not null then 'Intake note: ' || btrim(v_line.review_note) end
    );

    select * into v_item
    from public.create_item(
      p_workspace_id,
      btrim(v_line.proposed_title),
      coalesce(nullif(btrim(v_line.proposed_type), ''), 'other'),
      coalesce(nullif(btrim(v_line.proposed_purpose), ''), 'resale'),
      coalesce(v_notes, '')
    );

    if v_invoice.invoice_date is not null then
      update public.items
      set acquired_at = v_invoice.invoice_date,
          updated_at = now()
      where id = v_item.id
        and workspace_id = p_workspace_id;
    end if;

    insert into public.media_assets (
      workspace_id, item_id, category, role, storage_path,
      original_filename, mime_type, byte_size, caption, is_cover
    ) values (
      p_workspace_id,
      v_item.id,
      'invoice',
      'source_invoice',
      v_invoice.storage_path,
      v_invoice.original_filename,
      v_invoice.mime_type,
      v_invoice.byte_size,
      concat_ws(' · ',
        nullif(btrim(v_invoice.vendor_name), ''),
        case when nullif(btrim(v_invoice.invoice_number), '') is not null then 'Invoice ' || btrim(v_invoice.invoice_number) end
      ),
      false
    );

    update public.acquisition_invoice_lines
    set created_item_id = v_item.id,
        updated_at = now()
    where id = v_line.id
      and workspace_id = p_workspace_id;

    v_count := v_count + 1;
    v_ids := array_append(v_ids, v_item.id);
  end loop;

  if v_count > 0 then
    update public.acquisition_invoices
    set extraction_status = 'imported',
        updated_at = now()
    where id = p_invoice_id
      and workspace_id = p_workspace_id;
  end if;

  created_count := v_count;
  created_item_ids := v_ids;
  return next;
end;
$function$;
