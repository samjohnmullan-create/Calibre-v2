create index if not exists storage_locations_workspace_parent_idx
  on public.storage_locations (workspace_id, parent_id)
  where parent_id is not null;

create index if not exists storage_location_events_from_location_idx
  on public.storage_location_events (from_location_id)
  where from_location_id is not null;

create index if not exists storage_location_events_to_location_idx
  on public.storage_location_events (to_location_id)
  where to_location_id is not null;
