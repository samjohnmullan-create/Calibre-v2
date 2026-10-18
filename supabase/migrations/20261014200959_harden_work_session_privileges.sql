-- work_sessions mutations are intentionally RPC-only.
-- Project default grants include non-DML table privileges, so remove them
-- explicitly and restore only the SELECT access required by the Bench UI.

revoke all privileges on table public.work_sessions from anon;
revoke all privileges on table public.work_sessions from authenticated;
grant select on table public.work_sessions to authenticated;
