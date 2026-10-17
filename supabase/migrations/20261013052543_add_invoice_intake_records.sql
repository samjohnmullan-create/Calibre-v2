create table if not exists public.acquisition_invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  vendor_name text not null default '',
  invoice_number text not null default '',
  invoice_date date,
  currency text not null default 'AUD',
  subtotal numeric,
  fees numeric,
  postage numeric,
  total numeric,
  original_filename text not null,
  mime_type text not null default '',
  byte_size bigint,
  storage_path text not null,
  extraction_status text not null default 'uploaded' check (extraction_status in ('uploaded','processing','draft_ready','needs_review','failed','reviewed','imported')),
  extraction_text text not null default '',
  extraction_payload jsonb not null default '{}'::jsonb,
  notes text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.acquisition_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invoice_id uuid not null references public.acquisition_invoices(id) on delete cascade,
  line_number integer,
  lot_number text not null default '',
  raw_text text not null default '',
  proposed_title text not null default '',
  proposed_type text not null default 'other',
  proposed_purpose text not null default 'resale',
  quantity numeric not null default 1,
  unit_price numeric,
  line_total numeric,
  confidence numeric,
  include_on_import boolean not null default true,
  review_note text not null default '',
  created_item_id uuid references public.items(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists acquisition_invoices_workspace_idx on public.acquisition_invoices(workspace_id, created_at desc);
create index if not exists acquisition_invoice_lines_invoice_idx on public.acquisition_invoice_lines(invoice_id, line_number);

alter table public.acquisition_invoices enable row level security;
alter table public.acquisition_invoice_lines enable row level security;

drop policy if exists acquisition_invoices_select on public.acquisition_invoices;
create policy acquisition_invoices_select on public.acquisition_invoices for select using (
  exists (select 1 from public.workspace_members m where m.workspace_id = acquisition_invoices.workspace_id and m.user_id = auth.uid())
);
drop policy if exists acquisition_invoices_manage on public.acquisition_invoices;
create policy acquisition_invoices_manage on public.acquisition_invoices for all using (
  exists (select 1 from public.workspace_members m where m.workspace_id = acquisition_invoices.workspace_id and m.user_id = auth.uid() and m.role in ('owner','editor'))
) with check (
  exists (select 1 from public.workspace_members m where m.workspace_id = acquisition_invoices.workspace_id and m.user_id = auth.uid() and m.role in ('owner','editor'))
);

drop policy if exists acquisition_invoice_lines_select on public.acquisition_invoice_lines;
create policy acquisition_invoice_lines_select on public.acquisition_invoice_lines for select using (
  exists (select 1 from public.workspace_members m where m.workspace_id = acquisition_invoice_lines.workspace_id and m.user_id = auth.uid())
);
drop policy if exists acquisition_invoice_lines_manage on public.acquisition_invoice_lines;
create policy acquisition_invoice_lines_manage on public.acquisition_invoice_lines for all using (
  exists (select 1 from public.workspace_members m where m.workspace_id = acquisition_invoice_lines.workspace_id and m.user_id = auth.uid() and m.role in ('owner','editor'))
) with check (
  exists (select 1 from public.workspace_members m where m.workspace_id = acquisition_invoice_lines.workspace_id and m.user_id = auth.uid() and m.role in ('owner','editor'))
);

grant select, insert, update, delete on public.acquisition_invoices to authenticated;
grant select, insert, update, delete on public.acquisition_invoice_lines to authenticated;
