grant select, insert, update, delete on table public.knowledge_import_batches to authenticated;
grant select, insert, update, delete on table public.knowledge_dataset_records to authenticated;
grant select, insert, update, delete on table public.knowledge_sources to authenticated;
grant select, insert, update, delete on table public.knowledge_families to authenticated;
grant select, insert, update, delete on table public.knowledge_movements to authenticated;
grant select, insert, update, delete on table public.knowledge_movement_sources to authenticated;
grant select, insert, update, delete on table public.knowledge_part_refs to authenticated;
grant select, insert, update, delete on table public.knowledge_part_applications to authenticated;
grant select, insert, update, delete on table public.knowledge_compatibility_edges to authenticated;
grant select, insert, update, delete on table public.knowledge_identification_signals to authenticated;
grant select, insert, update, delete on table public.knowledge_technical_documents to authenticated;
grant select, insert, update, delete on table public.knowledge_rules to authenticated;
grant select, insert, update, delete on table public.knowledge_verifications to authenticated;

grant execute on function public.begin_knowledge_import(text,text,text,text,text,jsonb) to authenticated;
grant execute on function public.import_knowledge_chunk(text,text,jsonb) to authenticated;
grant execute on function public.finalize_knowledge_import(text) to authenticated;
