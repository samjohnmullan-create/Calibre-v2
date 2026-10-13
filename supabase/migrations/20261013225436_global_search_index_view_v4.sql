create or replace view public.calibre_search_index
with (security_invoker = true)
as
select
  i.workspace_id,
  'item'::text as kind,
  i.id as record_id,
  i.id as item_id,
  i.item_number::bigint as record_number,
  concat('#', i.item_number, ' · ', i.title)::text as title,
  coalesce(nullif(concat_ws(' · ', nullif(ii.maker, ''), nullif(ii.model, ''), nullif(ii.reference, ''), nullif(ii.serial, '')), ''), concat(i.type, ' · ', i.purpose))::text as subtitle,
  i.status::text as meta,
  concat('#/items/', i.id)::text as href,
  lower(concat_ws(' ', i.item_number::text, i.title, i.notes, i.type, i.purpose, ii.maker, ii.model, ii.reference, ii.serial, ii.movement_markings))::text as search_text
from public.items i
left join public.item_identity ii on ii.item_id = i.id and ii.workspace_id = i.workspace_id
where i.archived_at is null

union all

select
  w.workspace_id,
  'work'::text,
  w.id,
  w.item_id,
  w.work_number::bigint,
  concat('Work #', w.work_number, ' · ', w.title)::text,
  coalesce(nullif(w.next_action, ''), nullif(w.diagnosis, ''), 'No next action recorded')::text,
  w.status::text,
  concat('#/work/', w.id)::text,
  lower(concat_ws(' ', w.work_number::text, w.title, w.next_action, w.diagnosis))::text
from public.work_records w

union all

select
  p.workspace_id,
  'part'::text,
  p.id,
  p.donor_item_id,
  null::bigint,
  coalesce(nullif(p.description, ''), p.part_type)::text,
  concat_ws(' · ', nullif(p.manufacturer, ''), nullif(p.reference, ''), p.part_type)::text,
  p."condition"::text,
  '#/items?view=parts'::text,
  lower(concat_ws(' ', p.part_type, p.manufacturer, p.reference, p.description))::text
from public.parts p

union all

select
  ai.workspace_id,
  'invoice'::text,
  ai.id,
  null::uuid,
  null::bigint,
  coalesce(nullif(ai.vendor_name, ''), ai.original_filename)::text,
  case when nullif(ai.invoice_number, '') is not null then concat('Invoice ', ai.invoice_number)::text else ai.original_filename::text end,
  ai.extraction_status::text,
  '#/intake'::text,
  lower(concat_ws(' ', ai.vendor_name, ai.invoice_number, ai.original_filename))::text
from public.acquisition_invoices ai;

grant select on public.calibre_search_index to authenticated;
