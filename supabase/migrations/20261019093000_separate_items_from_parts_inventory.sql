-- Items are complete sale/collection/workshop objects. Parts live in the dedicated parts inventory.
update public.items
set type = 'other', updated_at = now()
where type not in ('watch','clock','jewellery','accessory','other');

alter table public.items
  drop constraint if exists items_type_allowed;

alter table public.items
  add constraint items_type_allowed
  check (type in ('watch','clock','jewellery','accessory','other'));

comment on column public.items.type is
  'Complete Item classification only: watch, clock, jewellery, accessory, other. Components and spare parts belong in parts_inventory, not items.type.';
