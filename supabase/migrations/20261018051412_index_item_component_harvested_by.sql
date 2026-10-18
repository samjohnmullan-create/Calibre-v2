-- Cover the harvested_by foreign key added by donor component harvesting.
create index if not exists item_component_assessments_harvested_by_idx
  on public.item_component_assessments (harvested_by);
