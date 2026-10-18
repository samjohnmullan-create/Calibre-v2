alter table public.work_templates
  add column if not exists published_at timestamptz;

alter table public.work_templates
  add column if not exists supersedes_template_id uuid references public.work_templates(id) on delete set null;

create index if not exists work_templates_supersedes_idx
  on public.work_templates(supersedes_template_id)
  where supersedes_template_id is not null;

update public.work_templates
set published_at=coalesce(published_at,created_at)
where is_active and published_at is null;

comment on column public.work_templates.published_at is
  'Null while a procedure version is a draft. Set when the version is published for use by new Work.';
comment on column public.work_templates.supersedes_template_id is
  'Previous procedure version cloned to create this version. Historical Work remains pinned to the version it originally used.';

create or replace function public.work_template_version_is_used(p_template_id uuid)
returns boolean
language sql
stable
security invoker
set search_path=public
as $$
  select exists(
    select 1 from public.work_plan_actions a where a.procedure_template_id=p_template_id
  ) or exists(
    select 1 from public.work_checklist_steps s where s.template_id=p_template_id
  );
$$;

revoke all on function public.work_template_version_is_used(uuid) from public;
revoke all on function public.work_template_version_is_used(uuid) from anon;
grant execute on function public.work_template_version_is_used(uuid) to authenticated;

create or replace function public.guard_used_work_template_version()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_used boolean;
begin
  v_used := public.work_template_version_is_used(old.id);

  if tg_op='DELETE' then
    if v_used then
      raise exception 'Used procedure versions are immutable and cannot be deleted; create a new version instead';
    end if;
    return old;
  end if;

  if v_used and (
    new.workspace_id is distinct from old.workspace_id or
    new.slug is distinct from old.slug or
    new.name is distinct from old.name or
    new.work_type is distinct from old.work_type or
    new.version is distinct from old.version or
    new.description is distinct from old.description or
    new.supersedes_template_id is distinct from old.supersedes_template_id
  ) then
    raise exception 'Used procedure versions are immutable; clone this procedure to a new version before changing its definition';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_used_work_template_version on public.work_templates;
create trigger guard_used_work_template_version
before update or delete on public.work_templates
for each row execute function public.guard_used_work_template_version();

create or replace function public.guard_used_work_template_step()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_old_template uuid;
  v_new_template uuid;
begin
  if tg_op <> 'INSERT' then v_old_template := old.template_id; end if;
  if tg_op <> 'DELETE' then v_new_template := new.template_id; end if;

  if (v_old_template is not null and public.work_template_version_is_used(v_old_template))
     or (v_new_template is not null and public.work_template_version_is_used(v_new_template)) then
    raise exception 'Stages in a used procedure version are immutable; clone the procedure to a new version before editing it';
  end if;

  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists guard_used_work_template_step on public.work_template_steps;
create trigger guard_used_work_template_step
before insert or update or delete on public.work_template_steps
for each row execute function public.guard_used_work_template_step();

create or replace function public.guard_used_work_template_check()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_old_template uuid;
  v_new_template uuid;
begin
  if tg_op <> 'INSERT' then
    select s.template_id into v_old_template
    from public.work_template_steps s where s.id=old.template_step_id;
  end if;
  if tg_op <> 'DELETE' then
    select s.template_id into v_new_template
    from public.work_template_steps s where s.id=new.template_step_id;
  end if;

  if (v_old_template is not null and public.work_template_version_is_used(v_old_template))
     or (v_new_template is not null and public.work_template_version_is_used(v_new_template)) then
    raise exception 'Checks in a used procedure version are immutable; clone the procedure to a new version before editing it';
  end if;

  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists guard_used_work_template_check on public.work_template_step_checks;
create trigger guard_used_work_template_check
before insert or update or delete on public.work_template_step_checks
for each row execute function public.guard_used_work_template_check();

create or replace function public.create_work_template_version(
  p_workspace_id uuid,
  p_template_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_source public.work_templates;
  v_new_template_id uuid;
  v_new_version integer;
  v_step record;
  v_new_step_id uuid;
begin
  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id=p_workspace_id
      and m.user_id=(select auth.uid())
      and m.role in ('owner','editor')
  ) then
    raise exception 'Not authorised for this workspace';
  end if;

  select * into v_source
  from public.work_templates
  where workspace_id=p_workspace_id and id=p_template_id;
  if not found then raise exception 'Procedure version not found'; end if;

  select coalesce(max(version),0)+1 into v_new_version
  from public.work_templates
  where workspace_id=p_workspace_id and slug=v_source.slug;

  insert into public.work_templates(
    workspace_id,slug,name,work_type,version,description,is_active,
    supersedes_template_id,published_at,created_by
  ) values (
    p_workspace_id,v_source.slug,v_source.name,v_source.work_type,v_new_version,
    v_source.description,false,v_source.id,null,(select auth.uid())
  ) returning id into v_new_template_id;

  for v_step in
    select * from public.work_template_steps
    where workspace_id=p_workspace_id and template_id=p_template_id
    order by sequence
  loop
    insert into public.work_template_steps(
      workspace_id,template_id,step_key,section_key,label,description,sequence,required
    ) values (
      p_workspace_id,v_new_template_id,v_step.step_key,v_step.section_key,
      v_step.label,v_step.description,v_step.sequence,v_step.required
    ) returning id into v_new_step_id;

    insert into public.work_template_step_checks(
      workspace_id,template_step_id,check_key,label,description,sequence,required,
      check_type,tool_key,knowledge_scope,evidence_required,answer_kind,
      answer_options,activation_rule,problem_values
    )
    select
      p_workspace_id,v_new_step_id,c.check_key,c.label,c.description,c.sequence,c.required,
      c.check_type,c.tool_key,c.knowledge_scope,c.evidence_required,c.answer_kind,
      c.answer_options,c.activation_rule,c.problem_values
    from public.work_template_step_checks c
    where c.workspace_id=p_workspace_id and c.template_step_id=v_step.id
    order by c.sequence;
  end loop;

  return v_new_template_id;
end;
$$;

revoke all on function public.create_work_template_version(uuid,uuid) from public;
revoke all on function public.create_work_template_version(uuid,uuid) from anon;
grant execute on function public.create_work_template_version(uuid,uuid) to authenticated;

create or replace function public.publish_work_template_version(
  p_workspace_id uuid,
  p_template_id uuid
)
returns public.work_templates
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_template public.work_templates;
begin
  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id=p_workspace_id
      and m.user_id=(select auth.uid())
      and m.role in ('owner','editor')
  ) then
    raise exception 'Not authorised for this workspace';
  end if;

  select * into v_template
  from public.work_templates
  where workspace_id=p_workspace_id and id=p_template_id
  for update;
  if not found then raise exception 'Procedure version not found'; end if;

  if not exists (
    select 1 from public.work_template_steps s
    where s.workspace_id=p_workspace_id and s.template_id=p_template_id
  ) then
    raise exception 'Cannot publish a procedure version with no stages';
  end if;

  update public.work_templates
  set is_active=false,updated_at=now()
  where workspace_id=p_workspace_id
    and slug=v_template.slug
    and id<>p_template_id
    and is_active;

  update public.work_templates
  set is_active=true,
      published_at=coalesce(published_at,now()),
      updated_at=now()
  where workspace_id=p_workspace_id and id=p_template_id
  returning * into v_template;

  return v_template;
end;
$$;

revoke all on function public.publish_work_template_version(uuid,uuid) from public;
revoke all on function public.publish_work_template_version(uuid,uuid) from anon;
grant execute on function public.publish_work_template_version(uuid,uuid) to authenticated;

-- Keep the generated final stage terminology aligned with the locked product model.
create or replace function public.attach_plan_final_qc_template()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_template_id uuid;
  v_template_step_id uuid;
begin
  if new.step_key='final_qc' then
    if new.label='Final QC' then
      new.label := 'Final Verification';
      new.description := 'Compare finished function, condition and timing against the induction baseline. Confirm required evidence and unresolved findings before Release.';
    end if;

    if new.template_step_id is null then
      select a.procedure_template_id,s.id
        into v_template_id,v_template_step_id
      from public.work_plan_actions a
      join public.work_template_steps s
        on s.workspace_id=new.workspace_id
       and s.template_id=a.procedure_template_id
       and s.step_key='final_qc'
      where a.workspace_id=new.workspace_id
        and a.work_id=new.work_id
        and a.procedure_template_id is not null
      order by a.sequence
      limit 1;

      if v_template_step_id is not null then
        new.template_id := v_template_id;
        new.template_step_id := v_template_step_id;
      end if;
    end if;
  end if;
  return new;
end
$$;

comment on function public.create_work_template_version(uuid,uuid) is
  'Clones a procedure and all stages/checks into the next draft version. Used versions remain immutable.';
comment on function public.publish_work_template_version(uuid,uuid) is
  'Publishes one procedure version for future Work and retires the previous active version without changing historical jobs.';
