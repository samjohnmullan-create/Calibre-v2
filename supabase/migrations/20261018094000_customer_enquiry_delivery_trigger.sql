create extension if not exists pg_net with schema extensions;

create or replace function public.queue_customer_enquiry_notification()
returns trigger
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  hook_secret text;
begin
  select decrypted_secret into hook_secret
  from vault.decrypted_secrets
  where name = 'customer_enquiry_hook_secret'
  order by updated_at desc
  limit 1;

  if hook_secret is null or hook_secret = '' then
    return new;
  end if;

  perform net.http_post(
    url := 'https://zmhbrqkzvgajmvhhorba.supabase.co/functions/v1/notify-customer-enquiry',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-calibre-hook-secret', hook_secret
    ),
    body := jsonb_build_object('enquiry_id', new.id),
    timeout_milliseconds := 5000
  );

  return new;
exception
  when others then
    return new;
end;
$$;

revoke all on function public.queue_customer_enquiry_notification() from public;
revoke all on function public.queue_customer_enquiry_notification() from anon;
revoke all on function public.queue_customer_enquiry_notification() from authenticated;

drop trigger if exists customer_enquiry_notification_after_insert on public.customer_enquiries;
create trigger customer_enquiry_notification_after_insert
after insert on public.customer_enquiries
for each row execute function public.queue_customer_enquiry_notification();