create or replace function public.search_knowledge_movements(p_query text, p_limit integer default 50)
returns table (
  id uuid,
  maker text,
  calibre text,
  calibre_family text,
  diameter_mm numeric,
  height_mm numeric,
  jewels integer,
  bph integer,
  winding text,
  power_reserve_hours numeric,
  escapement text,
  layout text,
  evidence_grade text,
  verification_status text,
  search_aliases jsonb,
  common_brands jsonb,
  primary_source_id uuid,
  notes text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    km.id,
    km.maker,
    km.calibre,
    km.calibre_family,
    km.diameter_mm,
    km.height_mm,
    km.jewels,
    km.bph,
    km.winding,
    km.power_reserve_hours,
    km.escapement,
    km.layout,
    km.evidence_grade,
    km.verification_status,
    km.search_aliases,
    km.common_brands,
    km.primary_source_id,
    km.notes
  from public.knowledge_movements km
  where trim(coalesce(p_query,'')) = ''
     or km.maker ilike '%' || trim(p_query) || '%'
     or km.calibre ilike '%' || trim(p_query) || '%'
     or km.calibre_family ilike '%' || trim(p_query) || '%'
     or km.search_aliases::text ilike '%' || trim(p_query) || '%'
     or km.common_brands::text ilike '%' || trim(p_query) || '%'
     or (km.maker || ' ' || km.calibre) ilike '%' || trim(p_query) || '%'
  order by
    case lower(coalesce(km.evidence_grade,''))
      when 'verified' then 0
      when 'manufacturer' then 1
      when 'documented' then 2
      when 'supported' then 3
      when 'candidate' then 4
      when 'generated' then 5
      else 6
    end,
    case when lower(km.maker || ' ' || km.calibre) = lower(trim(p_query)) then 0 else 1 end,
    km.maker,
    km.calibre
  limit greatest(1, least(coalesce(p_limit,50),100));
$$;

grant execute on function public.search_knowledge_movements(text, integer) to authenticated;
