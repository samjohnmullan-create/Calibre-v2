create index if not exists audit_events_actor_id_idx on public.audit_events (actor_id) where actor_id is not null;
