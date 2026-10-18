insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('calibre-media','calibre-media',false,26214400,array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy calibre_media_select on storage.objects
for select to authenticated
using (
  bucket_id='calibre-media'
  and exists(
    select 1 from public.workspace_members m
    where m.workspace_id::text=(storage.foldername(name))[1]
      and m.user_id=(select auth.uid())
  )
);

create policy calibre_media_insert on storage.objects
for insert to authenticated
with check (
  bucket_id='calibre-media'
  and exists(
    select 1 from public.workspace_members m
    where m.workspace_id::text=(storage.foldername(name))[1]
      and m.user_id=(select auth.uid())
      and m.role in ('owner','editor')
  )
);

create policy calibre_media_update on storage.objects
for update to authenticated
using (
  bucket_id='calibre-media'
  and exists(
    select 1 from public.workspace_members m
    where m.workspace_id::text=(storage.foldername(name))[1]
      and m.user_id=(select auth.uid())
      and m.role in ('owner','editor')
  )
)
with check (
  bucket_id='calibre-media'
  and exists(
    select 1 from public.workspace_members m
    where m.workspace_id::text=(storage.foldername(name))[1]
      and m.user_id=(select auth.uid())
      and m.role in ('owner','editor')
  )
);

create policy calibre_media_delete on storage.objects
for delete to authenticated
using (
  bucket_id='calibre-media'
  and exists(
    select 1 from public.workspace_members m
    where m.workspace_id::text=(storage.foldername(name))[1]
      and m.user_id=(select auth.uid())
      and m.role in ('owner','editor')
  )
);