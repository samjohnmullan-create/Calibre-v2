alter table public.customer_publications
  add column if not exists item_type text not null default 'watch';

update public.customer_publications p
set item_type = coalesce(nullif(i.type, ''), 'watch')
from public.items i
where i.id = p.item_id
  and p.item_type is distinct from coalesce(nullif(i.type, ''), 'watch');

create or replace function public.sync_customer_publication_item_type()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  select coalesce(nullif(i.type, ''), 'watch')
    into new.item_type
  from public.items i
  where i.id = new.item_id;

  new.item_type := coalesce(nullif(new.item_type, ''), 'watch');
  return new;
end;
$$;

drop trigger if exists customer_publications_sync_item_type on public.customer_publications;
create trigger customer_publications_sync_item_type
before insert or update of item_id on public.customer_publications
for each row execute function public.sync_customer_publication_item_type();
