-- Bench Mode session foundation.
-- Work remains the parent record; a session records actual hands-on bench time.

create table public.work_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  work_id uuid not null references public.work_records(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  started_by uuid default auth.uid(),
  ended_by uuid,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_sessions_time_order check (ended_at is null or ended_at >= started_at)
);

create unique index work_sessions_one_active_per_work
  on public.work_sessions(work_id)
  where ended_at is null;

create index work_sessions_workspace_work_started_idx
  on public.work_sessions(workspace_id, work_id, started_at desc);

create index work_sessions_workspace_item_started_idx
  on public.work_sessions(workspace_id, item_id, started_at desc);

alter table public.work_sessions enable row level security;

create policy work_sessions_select
on public.work_sessions
for select
using (
  exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = work_sessions.workspace_id
      and m.user_id = (select auth.uid())
  )
);

grant select on public.work_sessions to authenticated;
revoke insert, update, delete on public.work_sessions from authenticated;

create trigger work_sessions_touch
before update on public.work_sessions
for each row execute function app_private.touch_updated_at();

create trigger audit_work_sessions_mutations
after insert or update or delete on public.work_sessions
for each row execute function private.log_calibre_audit_event();

create or replace function public.guard_work_session_update()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if old.ended_at is not null then
    raise exception 'Completed bench sessions are historical and cannot be edited';
  end if;

  if new.workspace_id is distinct from old.workspace_id
     or new.work_id is distinct from old.work_id
     or new.item_id is distinct from old.item_id
     or new.started_at is distinct from old.started_at
     or new.started_by is distinct from old.started_by then
    raise exception 'Bench session identity and start evidence are immutable';
  end if;

  return new;
end;
$$;

create trigger work_sessions_guard_update
before update on public.work_sessions
for each row execute function public.guard_work_session_update();

create or replace function public.start_work_session(
  p_workspace_id uuid,
  p_work_id uuid
)
returns public.work_sessions
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_work public.work_records%rowtype;
  v_session public.work_sessions%rowtype;
  v_previous_status text;
begin
  if not exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = auth.uid()
      and m.role = any(array['owner','editor']::text[])
  ) then
    raise exception 'Not authorised for this workspace';
  end if;

  select * into v_work
  from public.work_records
  where workspace_id = p_workspace_id and id = p_work_id
  for update;

  if not found then
    raise exception 'Work record not found';
  end if;

  if v_work.status in ('complete', 'cancelled') then
    raise exception 'Completed or cancelled Work cannot start a bench session';
  end if;

  select * into v_session
  from public.work_sessions
  where workspace_id = p_workspace_id
    and work_id = p_work_id
    and ended_at is null
  order by started_at desc
  limit 1;

  if found then
    return v_session;
  end if;

  v_previous_status := v_work.status;

  if v_work.status <> 'on_bench' then
    update public.work_records
    set status = 'on_bench',
        started_at = coalesce(started_at, now()),
        updated_at = now()
    where workspace_id = p_workspace_id and id = p_work_id;
  elsif v_work.started_at is null then
    update public.work_records
    set started_at = now(), updated_at = now()
    where workspace_id = p_workspace_id and id = p_work_id;
  end if;

  insert into public.work_sessions (
    workspace_id, work_id, item_id, started_by
  ) values (
    p_workspace_id, p_work_id, v_work.item_id, auth.uid()
  )
  returning * into v_session;

  insert into public.work_events (
    workspace_id, work_id, item_id, event_type, summary, details, actor_id
  ) values (
    p_workspace_id,
    p_work_id,
    v_work.item_id,
    'bench_session_started',
    'Bench session started',
    jsonb_build_object(
      'session_id', v_session.id,
      'previous_status', v_previous_status
    ),
    auth.uid()
  );

  return v_session;
end;
$$;

create or replace function public.finish_work_session(
  p_workspace_id uuid,
  p_session_id uuid,
  p_note text default ''
)
returns public.work_sessions
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_session public.work_sessions%rowtype;
  v_duration_seconds integer;
begin
  if not exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = auth.uid()
      and m.role = any(array['owner','editor']::text[])
  ) then
    raise exception 'Not authorised for this workspace';
  end if;

  select * into v_session
  from public.work_sessions
  where workspace_id = p_workspace_id and id = p_session_id
  for update;

  if not found then
    raise exception 'Bench session not found';
  end if;

  if v_session.ended_at is not null then
    return v_session;
  end if;

  update public.work_sessions
  set ended_at = now(),
      ended_by = auth.uid(),
      note = case when btrim(coalesce(p_note, '')) = '' then note else btrim(p_note) end
  where id = v_session.id
  returning * into v_session;

  v_duration_seconds := greatest(0, floor(extract(epoch from (v_session.ended_at - v_session.started_at))))::integer;

  insert into public.work_events (
    workspace_id, work_id, item_id, event_type, summary, details, actor_id
  ) values (
    p_workspace_id,
    v_session.work_id,
    v_session.item_id,
    'bench_session_finished',
    'Bench session finished',
    jsonb_build_object(
      'session_id', v_session.id,
      'duration_seconds', v_duration_seconds,
      'note', v_session.note
    ),
    auth.uid()
  );

  return v_session;
end;
$$;

revoke all on function public.start_work_session(uuid, uuid) from public;
revoke all on function public.finish_work_session(uuid, uuid, text) from public;
grant execute on function public.start_work_session(uuid, uuid) to authenticated;
grant execute on function public.finish_work_session(uuid, uuid, text) to authenticated;
