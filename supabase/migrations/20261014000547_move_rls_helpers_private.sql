alter function public.can_manage_knowledge() set schema private;
alter function public.is_workspace_owner(uuid) set schema private;

grant usage on schema private to authenticated;
grant execute on function private.can_manage_knowledge() to authenticated;
grant execute on function private.is_workspace_owner(uuid) to authenticated;

revoke execute on function private.can_manage_knowledge() from public, anon;
revoke execute on function private.is_workspace_owner(uuid) from public, anon;
