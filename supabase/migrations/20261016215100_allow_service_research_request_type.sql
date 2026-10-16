alter table public.research_requests
  drop constraint if exists research_requests_request_type_check;

alter table public.research_requests
  add constraint research_requests_request_type_check
  check (request_type = any (array[
    'identify'::text,
    'history'::text,
    'movement'::text,
    'parts'::text,
    'valuation'::text,
    'listing'::text,
    'comprehensive'::text,
    'service'::text,
    'other'::text
  ]));
