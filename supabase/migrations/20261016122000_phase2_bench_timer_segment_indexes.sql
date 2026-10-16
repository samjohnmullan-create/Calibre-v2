create index if not exists work_session_segments_work_id_idx
  on public.work_session_segments(work_id);

create index if not exists work_session_segments_item_id_idx
  on public.work_session_segments(item_id);
