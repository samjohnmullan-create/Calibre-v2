alter table public.work_sessions
  add column if not exists paused_at timestamptz;

create table if not exists public.work_session_segments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  session_id uuid not null references public.work_sessions(id) on delete cascade,
  work_id uuid not null references public.work_records(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_by uuid default auth.uid(),
  ended_by uuid,
  created_at timestamptz not null default now(),
  constraint work_session_segments_time_order check (ended_at is null or ended_at >= started_at)
);

create unique index if not exists work_session_segments_one_open_per_session
  on public.work_session_segments(session_id)
  where ended_at is null;

create index if not exists work_session_segments_session_started_idx
  on public.work_session_segments(session_id, started_at);

create index if not exists work_session_segments_work_started_idx
  on public.work_session_segments(workspace_id, work_id, started_at);

alter table public.work_session_segments enable row level security;

drop policy if exists work_session_segments_select on public.work_session_segments;
create policy work_session_segments_select
on public.work_session_segments
for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = work_session_segments.workspace_id
      and m.user_id = (select auth.uid())
  )
);

grant select on public.work_session_segments to authenticated;
revoke insert, update, delete on public.work_session_segments from authenticated;

insert into public.work_session_segments (
  workspace_id, session_id, work_id, item_id, started_at, ended_at, created_by, ended_by
)
select
  s.workspace_id,
  s.id,
  s.work_id,
  s.item_id,
  s.started_at,
  s.ended_at,
  s.started_by,
  s.ended_by
from public.work_sessions s
where not exists (
  select 1 from public.work_session_segments seg where seg.session_id = s.id
);

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

  if not found then raise exception 'Work record not found'; end if;
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
    if v_session.started_by is distinct from auth.uid() then
      raise exception 'This Work already has an active bench session for another user';
    end if;
    return v_session;
  end if;

  if exists (
    select 1 from public.work_sessions s
    where s.workspace_id = p_workspace_id
      and s.started_by = auth.uid()
      and s.ended_at is null
  ) then
    raise exception 'Finish your active bench session before starting another one';
  end if;

  v_previous_status := v_work.status;

  if v_work.status <> 'on_bench' then
    update public.work_records
    set status = 'on_bench', started_at = coalesce(started_at, now()), updated_at = now()
    where workspace_id = p_workspace_id and id = p_work_id;
  elsif v_work.started_at is null then
    update public.work_records
    set started_at = now(), updated_at = now()
    where workspace_id = p_workspace_id and id = p_work_id;
  end if;

  insert into public.work_sessions (workspace_id, work_id, item_id, started_by, paused_at)
  values (p_workspace_id, p_work_id, v_work.item_id, auth.uid(), null)
  returning * into v_session;

  insert into public.work_session_segments (
    workspace_id, session_id, work_id, item_id, started_at, created_by
  ) values (
    p_workspace_id, v_session.id, p_work_id, v_work.item_id, v_session.started_at, auth.uid()
  );

  insert into public.work_events (
    workspace_id, work_id, item_id, event_type, summary, details, actor_id
  ) values (
    p_workspace_id, p_work_id, v_work.item_id,
    'bench_session_started', 'Bench session started',
    jsonb_build_object('session_id', v_session.id, 'previous_status', v_previous_status),
    auth.uid()
  );

  return v_session;
end;
$$;

create or replace function public.pause_work_session(
  p_workspace_id uuid,
  p_session_id uuid
)
returns public.work_sessions
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_session public.work_sessions%rowtype;
  v_now timestamptz := now();
begin
  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = auth.uid()
      and m.role = any(array['owner','editor']::text[])
  ) then raise exception 'Not authorised for this workspace'; end if;

  select * into v_session
  from public.work_sessions
  where workspace_id = p_workspace_id and id = p_session_id
  for update;

  if not found then raise exception 'Bench session not found'; end if;
  if v_session.ended_at is not null then raise exception 'Completed bench sessions cannot be paused'; end if;
  if v_session.started_by is distinct from auth.uid() then
    raise exception 'Only the user who started this bench session can pause it';
  end if;
  if v_session.paused_at is not null then return v_session; end if;

  update public.work_session_segments
  set ended_at = v_now, ended_by = auth.uid()
  where session_id = v_session.id and ended_at is null;

  update public.work_sessions
  set paused_at = v_now
  where id = v_session.id
  returning * into v_session;

  insert into public.work_events (
    workspace_id, work_id, item_id, event_type, summary, details, actor_id
  ) values (
    p_workspace_id, v_session.work_id, v_session.item_id,
    'bench_session_paused', 'Bench session paused',
    jsonb_build_object('session_id', v_session.id), auth.uid()
  );

  return v_session;
end;
$$;

create or replace function public.resume_work_session(
  p_workspace_id uuid,
  p_session_id uuid
)
returns public.work_sessions
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_session public.work_sessions%rowtype;
  v_now timestamptz := now();
begin
  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = auth.uid()
      and m.role = any(array['owner','editor']::text[])
  ) then raise exception 'Not authorised for this workspace'; end if;

  select * into v_session
  from public.work_sessions
  where workspace_id = p_workspace_id and id = p_session_id
  for update;

  if not found then raise exception 'Bench session not found'; end if;
  if v_session.ended_at is not null then raise exception 'Completed bench sessions cannot be resumed'; end if;
  if v_session.started_by is distinct from auth.uid() then
    raise exception 'Only the user who started this bench session can resume it';
  end if;
  if v_session.paused_at is null then return v_session; end if;

  if exists (
    select 1 from public.work_session_segments seg
    where seg.session_id = v_session.id and seg.ended_at is null
  ) then
    raise exception 'Bench session already has an open working segment';
  end if;

  insert into public.work_session_segments (
    workspace_id, session_id, work_id, item_id, started_at, created_by
  ) values (
    p_workspace_id, v_session.id, v_session.work_id, v_session.item_id, v_now, auth.uid()
  );

  update public.work_sessions
  set paused_at = null
  where id = v_session.id
  returning * into v_session;

  insert into public.work_events (
    workspace_id, work_id, item_id, event_type, summary, details, actor_id
  ) values (
    p_workspace_id, v_session.work_id, v_session.item_id,
    'bench_session_resumed', 'Bench session resumed',
    jsonb_build_object('session_id', v_session.id), auth.uid()
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
  v_now timestamptz := now();
  v_duration_seconds integer;
begin
  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = auth.uid()
      and m.role = any(array['owner','editor']::text[])
  ) then raise exception 'Not authorised for this workspace'; end if;

  select * into v_session
  from public.work_sessions
  where workspace_id = p_workspace_id and id = p_session_id
  for update;

  if not found then raise exception 'Bench session not found'; end if;
  if v_session.ended_at is not null then return v_session; end if;
  if v_session.started_by is distinct from auth.uid() then
    raise exception 'Only the user who started this bench session can finish it';
  end if;

  update public.work_session_segments
  set ended_at = v_now, ended_by = auth.uid()
  where session_id = v_session.id and ended_at is null;

  update public.work_sessions
  set ended_at = v_now,
      ended_by = auth.uid(),
      paused_at = null,
      note = case when btrim(coalesce(p_note, '')) = '' then note else btrim(p_note) end
  where id = v_session.id
  returning * into v_session;

  select coalesce(sum(greatest(0, floor(extract(epoch from (seg.ended_at - seg.started_at))))::integer), 0)
  into v_duration_seconds
  from public.work_session_segments seg
  where seg.session_id = v_session.id and seg.ended_at is not null;

  insert into public.work_events (
    workspace_id, work_id, item_id, event_type, summary, details, actor_id
  ) values (
    p_workspace_id, v_session.work_id, v_session.item_id,
    'bench_session_finished', 'Bench session finished',
    jsonb_build_object('session_id', v_session.id, 'duration_seconds', v_duration_seconds, 'note', v_session.note),
    auth.uid()
  );

  return v_session;
end;
$$;

revoke all on function public.start_work_session(uuid, uuid) from public;
revoke all on function public.pause_work_session(uuid, uuid) from public;
revoke all on function public.resume_work_session(uuid, uuid) from public;
revoke all on function public.finish_work_session(uuid, uuid, text) from public;

grant execute on function public.start_work_session(uuid, uuid) to authenticated;
grant execute on function public.pause_work_session(uuid, uuid) to authenticated;
grant execute on function public.resume_work_session(uuid, uuid) to authenticated;
grant execute on function public.finish_work_session(uuid, uuid, text) to authenticated;
