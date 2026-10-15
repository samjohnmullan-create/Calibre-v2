drop policy if exists knowledge_movement_guidance_manage on public.knowledge_movement_guidance;
drop policy if exists knowledge_movement_guidance_insert on public.knowledge_movement_guidance;
drop policy if exists knowledge_movement_guidance_update on public.knowledge_movement_guidance;
drop policy if exists knowledge_movement_guidance_delete on public.knowledge_movement_guidance;
create policy knowledge_movement_guidance_insert on public.knowledge_movement_guidance
  for insert to authenticated with check (private.can_manage_knowledge());
create policy knowledge_movement_guidance_update on public.knowledge_movement_guidance
  for update to authenticated using (private.can_manage_knowledge()) with check (private.can_manage_knowledge());
create policy knowledge_movement_guidance_delete on public.knowledge_movement_guidance
  for delete to authenticated using (private.can_manage_knowledge());
