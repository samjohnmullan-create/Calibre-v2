alter table public.sources drop constraint if exists sources_source_type_check;
alter table public.sources add constraint sources_source_type_check check (
  source_type = any (array[
    'manufacturer'::text,
    'catalogue'::text,
    'book'::text,
    'website'::text,
    'auction'::text,
    'sold_comp'::text,
    'invoice'::text,
    'email'::text,
    'document'::text,
    'bench_note'::text,
    'vendor'::text,
    'other'::text
  ])
);

create or replace function private.normalize_purchase_source_name(p_name text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select lower(regexp_replace(trim(p_name), '[^[:alnum:]]+', '', 'g'));
$$;

create unique index if not exists sources_workspace_vendor_name_uq
  on public.sources (workspace_id, private.normalize_purchase_source_name(title))
  where source_type = 'vendor';

with canonical as (
  select distinct on (
    p.workspace_id,
    private.normalize_purchase_source_name(p.vendor_name)
  )
    p.workspace_id,
    trim(p.vendor_name) as title
  from public.purchases p
  where trim(coalesce(p.vendor_name, '')) <> ''
  order by
    p.workspace_id,
    private.normalize_purchase_source_name(p.vendor_name),
    p.created_at asc,
    p.id asc
)
insert into public.sources (
  workspace_id,
  source_type,
  title,
  reliability,
  notes
)
select
  c.workspace_id,
  'vendor',
  c.title,
  'unknown',
  'Canonical acquisition vendor/source created from Purchase history.'
from canonical c
where private.normalize_purchase_source_name(c.title) <> ''
on conflict do nothing;

update public.purchases p
set source_id = s.id,
    updated_at = now()
from public.sources s
where p.source_id is null
  and s.workspace_id = p.workspace_id
  and s.source_type = 'vendor'
  and trim(coalesce(p.vendor_name, '')) <> ''
  and private.normalize_purchase_source_name(s.title) = private.normalize_purchase_source_name(p.vendor_name);

create or replace function private.attach_purchase_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.sources%rowtype;
  v_key text;
begin
  if new.source_id is not null
     and (tg_op = 'INSERT' or new.source_id is distinct from old.source_id) then
    select *
      into v_source
      from public.sources s
     where s.id = new.source_id
       and s.workspace_id = new.workspace_id;

    if not found then
      raise exception 'Purchase source does not belong to this workspace.';
    end if;

    if v_source.source_type <> 'vendor' then
      raise exception 'Purchase source must be a canonical acquisition vendor/source.';
    end if;

    if trim(coalesce(new.vendor_name, '')) = '' then
      new.vendor_name := v_source.title;
    end if;

    return new;
  end if;

  if trim(coalesce(new.vendor_name, '')) = '' then
    if tg_op = 'UPDATE' and new.vendor_name is distinct from old.vendor_name then
      new.source_id := null;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.vendor_name is not distinct from old.vendor_name
     and new.source_id is not null then
    return new;
  end if;

  v_key := private.normalize_purchase_source_name(new.vendor_name);
  if v_key = '' then
    return new;
  end if;

  select *
    into v_source
    from public.sources s
   where s.workspace_id = new.workspace_id
     and s.source_type = 'vendor'
     and private.normalize_purchase_source_name(s.title) = v_key
   limit 1;

  if not found then
    begin
      insert into public.sources (
        workspace_id,
        source_type,
        title,
        reliability,
        notes
      ) values (
        new.workspace_id,
        'vendor',
        trim(new.vendor_name),
        'unknown',
        'Canonical acquisition vendor/source created automatically from Purchase intake.'
      )
      returning * into v_source;
    exception
      when unique_violation then
        select *
          into v_source
          from public.sources s
         where s.workspace_id = new.workspace_id
           and s.source_type = 'vendor'
           and private.normalize_purchase_source_name(s.title) = v_key
         limit 1;
    end;
  end if;

  new.source_id := v_source.id;
  return new;
end;
$$;

drop trigger if exists purchases_attach_source on public.purchases;
create trigger purchases_attach_source
before insert or update of vendor_name, source_id, workspace_id
on public.purchases
for each row
execute function private.attach_purchase_source();
