insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'calibre-public',
  'calibre-public',
  true,
  10485760,
  array['image/jpeg','image/png','image/webp','image/avif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "calibre_public_editor_insert" on storage.objects;
create policy "calibre_public_editor_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'calibre-public'
    and exists (
      select 1 from public.workspace_members m
      where m.workspace_id::text = (storage.foldername(name))[1]
        and m.user_id = (select auth.uid())
        and m.role = any (array['owner'::text, 'editor'::text])
    )
  );

drop policy if exists "calibre_public_editor_update" on storage.objects;
create policy "calibre_public_editor_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'calibre-public'
    and exists (
      select 1 from public.workspace_members m
      where m.workspace_id::text = (storage.foldername(name))[1]
        and m.user_id = (select auth.uid())
        and m.role = any (array['owner'::text, 'editor'::text])
    )
  )
  with check (
    bucket_id = 'calibre-public'
    and exists (
      select 1 from public.workspace_members m
      where m.workspace_id::text = (storage.foldername(name))[1]
        and m.user_id = (select auth.uid())
        and m.role = any (array['owner'::text, 'editor'::text])
    )
  );

drop policy if exists "calibre_public_editor_delete" on storage.objects;
create policy "calibre_public_editor_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'calibre-public'
    and exists (
      select 1 from public.workspace_members m
      where m.workspace_id::text = (storage.foldername(name))[1]
        and m.user_id = (select auth.uid())
        and m.role = any (array['owner'::text, 'editor'::text])
    )
  );