alter table public.research_findings
  add column if not exists proposed_destination text,
  add column if not exists proposed_field text,
  add column if not exists proposed_value jsonb,
  add column if not exists proposal_status text not null default 'none',
  add column if not exists applied_at timestamptz;

alter table public.research_findings
  drop constraint if exists research_findings_proposed_destination_check;

alter table public.research_findings
  add constraint research_findings_proposed_destination_check
  check (
    proposed_destination is null
    or proposed_destination = any (array['item','identity','passport','commerce','work'])
  );

alter table public.research_findings
  drop constraint if exists research_findings_proposal_status_check;

alter table public.research_findings
  add constraint research_findings_proposal_status_check
  check (proposal_status = any (array['none','pending','applied','kept','ignored']));
