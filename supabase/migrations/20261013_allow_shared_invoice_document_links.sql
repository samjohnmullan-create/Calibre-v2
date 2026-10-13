alter table public.media_assets
  drop constraint if exists media_assets_workspace_id_storage_path_key;

drop index if exists public.media_assets_workspace_id_storage_path_key;

create unique index if not exists media_assets_workspace_item_storage_uq
  on public.media_assets(workspace_id, item_id, storage_path);
