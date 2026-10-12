alter table public.passports
  add column if not exists knowledge_movement_id uuid references public.knowledge_movements(id) on delete set null,
  add column if not exists movement_identification_status text not null default 'unlinked';

alter table public.passports
  drop constraint if exists passports_movement_identification_status_check;

alter table public.passports
  add constraint passports_movement_identification_status_check
  check (movement_identification_status in ('unlinked','candidate','confirmed','rejected'));

create index if not exists passports_knowledge_movement_idx on public.passports (knowledge_movement_id);
