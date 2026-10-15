create or replace function public.sanitize_research_request_image_media()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  filtered_photos jsonb;
  filtered_count integer;
  original_count integer;
begin
  if jsonb_typeof(new.requested_scope -> 'photos') = 'array' then
    original_count := jsonb_array_length(new.requested_scope -> 'photos');

    select coalesce(jsonb_agg(photo), '[]'::jsonb), count(*)
      into filtered_photos, filtered_count
    from jsonb_array_elements(new.requested_scope -> 'photos') as photo
    where coalesce(photo ->> 'url', '') ~* '\.(jpe?g|png|gif|webp)(\?|$)';

    new.requested_scope := jsonb_set(new.requested_scope, '{photos}', filtered_photos, true);
    new.requested_scope := jsonb_set(new.requested_scope, '{photo_count}', to_jsonb(filtered_count), true);
    new.requested_scope := jsonb_set(new.requested_scope, '{media_skipped_count}', to_jsonb(greatest(original_count - filtered_count, 0)), true);
  end if;

  return new;
end;
$$;

drop trigger if exists research_requests_sanitize_image_media on public.research_requests;
create trigger research_requests_sanitize_image_media
before insert or update of requested_scope
on public.research_requests
for each row
execute function public.sanitize_research_request_image_media();
