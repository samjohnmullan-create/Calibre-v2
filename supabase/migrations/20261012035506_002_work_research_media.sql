create table public.work_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  item_id uuid not null,
  work_number bigint generated always as identity,
  type text not null check (type in ('inspection','service','repair','restoration','cleaning','assessment','photography','listing_prep','qc','other')),
  title text not null check (btrim(title) <> ''),
  status text not null default 'queued' check (status in ('queued','ready','on_bench','waiting','qc','complete','cancelled')),
  waiting_reason text check (waiting_reason is null or waiting_reason in ('parts','research','external_service','customer','tool_equipment','other')),
  priority smallint not null default 0 check (priority between 0 and 5),
  next_action text not null default '',
  blocker text not null default '',
  diagnosis text not null default '',
  repair_performed text not null default '',
  notes text not null default '',
  opened_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,id),
  foreign key(workspace_id,item_id) references public.items(workspace_id,id) on delete cascade
);

create table public.work_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  work_id uuid not null,
  item_id uuid not null,
  event_type text not null check (btrim(event_type) <> ''),
  summary text not null check (btrim(summary) <> ''),
  details jsonb not null default '{}'::jsonb,
  actor_id uuid default auth.uid() references auth.users(id) on delete set null,
  actor_type text not null default 'user' check (actor_type in ('user','automation','research','import','system')),
  created_at timestamptz not null default now(),
  foreign key(workspace_id,work_id) references public.work_records(workspace_id,id) on delete cascade,
  foreign key(workspace_id,item_id) references public.items(workspace_id,id) on delete cascade
);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  item_id uuid not null,
  work_id uuid,
  category text not null check (category in ('dial','movement','caseback','inside_caseback','crown','serial','hallmark','damage','part','measurement','work_progress','finished','sales','document','invoice','other')),
  role text not null default '',
  storage_path text not null check (btrim(storage_path) <> ''),
  thumbnail_path text not null default '',
  original_filename text not null default '',
  mime_type text not null default '',
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  byte_size bigint check (byte_size is null or byte_size >= 0),
  caption text not null default '',
  evidence_note text not null default '',
  is_cover boolean not null default false,
  taken_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(workspace_id,storage_path),
  foreign key(workspace_id,item_id) references public.items(workspace_id,id) on delete cascade,
  foreign key(workspace_id,work_id) references public.work_records(workspace_id,id) on delete set null
);

create table public.research_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  item_id uuid not null,
  work_id uuid,
  request_type text not null default 'comprehensive' check (request_type in ('identify','history','movement','parts','valuation','listing','comprehensive','other')),
  status text not null default 'pending' check (status in ('pending','processing','needs_input','complete','cancelled','failed')),
  requested_scope jsonb not null default '{}'::jsonb,
  requested_by uuid default auth.uid() references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,id),
  foreign key(workspace_id,item_id) references public.items(workspace_id,id) on delete cascade,
  foreign key(workspace_id,work_id) references public.work_records(workspace_id,id) on delete set null
);

create table public.research_findings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  research_request_id uuid not null,
  item_id uuid not null,
  category text not null check (btrim(category) <> ''),
  finding text not null check (btrim(finding) <> ''),
  confidence text not null default 'unknown' check (confidence in ('confirmed','strong','probable','possible','unknown')),
  decision text not null default 'pending' check (decision in ('pending','accepted','rejected','superseded')),
  evidence_note text not null default '',
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,id),
  foreign key(workspace_id,research_request_id) references public.research_requests(workspace_id,id) on delete cascade,
  foreign key(workspace_id,item_id) references public.items(workspace_id,id) on delete cascade
);

create table public.research_finding_sources (
  workspace_id uuid not null,
  research_finding_id uuid not null references public.research_findings(id) on delete cascade,
  source_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(research_finding_id,source_id),
  foreign key(workspace_id,source_id) references public.sources(workspace_id,id) on delete cascade
);

create index work_item_status_idx on public.work_records(workspace_id,item_id,status);
create index work_queue_idx on public.work_records(workspace_id,status,priority desc,updated_at desc);
create index work_events_work_idx on public.work_events(workspace_id,work_id,created_at desc);
create index media_item_idx on public.media_assets(workspace_id,item_id,category,created_at desc);
create index media_work_idx on public.media_assets(workspace_id,work_id) where work_id is not null;
create unique index media_one_cover_idx on public.media_assets(item_id) where is_cover;
create index research_item_idx on public.research_requests(workspace_id,item_id,requested_at desc);
create index findings_item_idx on public.research_findings(workspace_id,item_id,decision,created_at desc);

create trigger work_records_touch before update on public.work_records for each row execute function app_private.touch_updated_at();
create trigger media_touch before update on public.media_assets for each row execute function app_private.touch_updated_at();
create trigger research_requests_touch before update on public.research_requests for each row execute function app_private.touch_updated_at();
create trigger research_findings_touch before update on public.research_findings for each row execute function app_private.touch_updated_at();