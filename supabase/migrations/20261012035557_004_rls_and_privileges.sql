do $$
declare t text;
begin
  foreach t in array array[
    'workspaces','workspace_members','storage_locations','sources','items','item_identity','item_facts','item_fact_sources','passports',
    'work_records','work_events','media_assets','research_requests','research_findings','research_finding_sources','parts','measurements','timing_runs',
    'part_applications','part_fit_evidence','item_relationships','cost_entries','valuations','sales','offers','purchases','tools','consumables','audit_events',
    'knowledge_sources','knowledge_movements','knowledge_part_refs','knowledge_part_applications'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create policy workspaces_select on public.workspaces
for select to authenticated
using (
  owner_id=(select auth.uid())
  or exists(select 1 from public.workspace_members m where m.workspace_id=workspaces.id and m.user_id=(select auth.uid()))
);
create policy workspaces_insert on public.workspaces
for insert to authenticated with check(owner_id=(select auth.uid()));
create policy workspaces_update on public.workspaces
for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy workspaces_delete on public.workspaces
for delete to authenticated using(owner_id=(select auth.uid()));

create policy workspace_members_select_self on public.workspace_members
for select to authenticated using(user_id=(select auth.uid()));
create policy workspace_members_insert_owner_self on public.workspace_members
for insert to authenticated with check(
  user_id=(select auth.uid()) and role='owner'
  and exists(select 1 from public.workspaces w where w.id=workspace_members.workspace_id and w.owner_id=(select auth.uid()))
);

-- Member-management beyond the initial owner is intentionally server/admin mediated for v2 launch.

do $$
declare t text;
begin
  foreach t in array array[
    'storage_locations','sources','items','item_identity','item_facts','item_fact_sources','passports','work_records','work_events','media_assets',
    'research_requests','research_findings','research_finding_sources','parts','measurements','timing_runs','part_applications','part_fit_evidence',
    'item_relationships','cost_entries','valuations','sales','offers','purchases','tools','consumables'
  ] loop
    execute format('create policy %I on public.%I for select to authenticated using (exists(select 1 from public.workspace_members m where m.workspace_id=%I.workspace_id and m.user_id=(select auth.uid())))',t||'_select',t,t);
    execute format('create policy %I on public.%I for insert to authenticated with check (exists(select 1 from public.workspace_members m where m.workspace_id=%I.workspace_id and m.user_id=(select auth.uid()) and m.role in (''owner'',''editor'')))',t||'_insert',t,t);
    execute format('create policy %I on public.%I for update to authenticated using (exists(select 1 from public.workspace_members m where m.workspace_id=%I.workspace_id and m.user_id=(select auth.uid()) and m.role in (''owner'',''editor''))) with check (exists(select 1 from public.workspace_members m where m.workspace_id=%I.workspace_id and m.user_id=(select auth.uid()) and m.role in (''owner'',''editor'')))',t||'_update',t,t,t);
    execute format('create policy %I on public.%I for delete to authenticated using (exists(select 1 from public.workspace_members m where m.workspace_id=%I.workspace_id and m.user_id=(select auth.uid()) and m.role in (''owner'',''editor'')))',t||'_delete',t,t);
  end loop;
end $$;

create policy audit_events_select on public.audit_events
for select to authenticated using(exists(select 1 from public.workspace_members m where m.workspace_id=audit_events.workspace_id and m.user_id=(select auth.uid())));
create policy audit_events_insert on public.audit_events
for insert to authenticated with check(exists(select 1 from public.workspace_members m where m.workspace_id=audit_events.workspace_id and m.user_id=(select auth.uid()) and m.role in ('owner','editor')));

create policy knowledge_sources_read on public.knowledge_sources for select to authenticated using(true);
create policy knowledge_movements_read on public.knowledge_movements for select to authenticated using(true);
create policy knowledge_part_refs_read on public.knowledge_part_refs for select to authenticated using(true);
create policy knowledge_part_applications_read on public.knowledge_part_applications for select to authenticated using(true);

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

grant select,insert,update,delete on public.workspaces to authenticated;
grant select,insert on public.workspace_members to authenticated;
grant select,insert,update,delete on
  public.storage_locations,public.sources,public.items,public.item_identity,public.item_facts,public.item_fact_sources,public.passports,
  public.work_records,public.work_events,public.media_assets,public.research_requests,public.research_findings,public.research_finding_sources,
  public.parts,public.measurements,public.timing_runs,public.part_applications,public.part_fit_evidence,public.item_relationships,
  public.cost_entries,public.valuations,public.sales,public.offers,public.purchases,public.tools,public.consumables
to authenticated;
grant select,insert on public.audit_events to authenticated;
grant select on public.knowledge_sources,public.knowledge_movements,public.knowledge_part_refs,public.knowledge_part_applications to authenticated;
grant usage,select on all sequences in schema public to authenticated;