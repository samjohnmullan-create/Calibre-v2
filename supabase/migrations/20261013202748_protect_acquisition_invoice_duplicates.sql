alter table public.acquisition_invoices drop constraint if exists acquisition_invoices_extraction_status_check;
alter table public.acquisition_invoices add constraint acquisition_invoices_extraction_status_check check (extraction_status = any (array['uploaded'::text,'processing'::text,'draft_ready'::text,'needs_review'::text,'failed'::text,'reviewed'::text,'imported'::text,'duplicate'::text]));

alter table public.acquisition_invoices add column if not exists file_sha256 text;

with ranked as (
  select i.id,
         row_number() over (
           partition by i.workspace_id,
             lower(regexp_replace(regexp_replace(btrim(i.vendor_name),'\s+(ltd|limited|pty|proprietary|inc|llc|plc)\.?$','','i'),'[^a-z0-9]+','','g')),
             lower(regexp_replace(btrim(i.invoice_number),'[^a-z0-9]+','','gi')),
             i.invoice_date
           order by
             case when i.extraction_status='imported' then 0 else 1 end,
             (select count(*) from public.acquisition_invoice_lines l where l.invoice_id=i.id and l.created_item_id is not null) desc,
             i.created_at desc
         ) as rn
  from public.acquisition_invoices i
  where btrim(i.vendor_name)<>'' and btrim(i.invoice_number)<>'' and i.invoice_date is not null
)
update public.acquisition_invoices i
set extraction_status='duplicate',
    notes=concat_ws(E'\n', nullif(i.notes,''), 'Marked duplicate automatically; canonical invoice retained.'),
    updated_at=now()
from ranked r
where i.id=r.id and r.rn>1 and i.extraction_status<>'imported';

create unique index if not exists acquisition_invoices_file_sha256_uq
  on public.acquisition_invoices(workspace_id,file_sha256)
  where file_sha256 is not null and btrim(file_sha256)<>'' and extraction_status<>'duplicate';

create unique index if not exists acquisition_invoices_business_identity_uq
  on public.acquisition_invoices(
    workspace_id,
    lower(regexp_replace(regexp_replace(btrim(vendor_name),'\s+(ltd|limited|pty|proprietary|inc|llc|plc)\.?$','','i'),'[^a-z0-9]+','','g')),
    lower(regexp_replace(btrim(invoice_number),'[^a-z0-9]+','','gi')),
    invoice_date
  )
  where btrim(vendor_name)<>'' and btrim(invoice_number)<>'' and invoice_date is not null and extraction_status<>'duplicate';
