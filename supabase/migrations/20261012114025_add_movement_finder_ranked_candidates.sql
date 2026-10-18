create or replace function public.find_movement_candidates(
  p_markings text default '',
  p_maker text default '',
  p_diameter_mm numeric default null,
  p_height_mm numeric default null,
  p_jewels integer default null,
  p_bph integer default null,
  p_winding text default '',
  p_limit integer default 25
)
returns table(
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
  evidence_grade text,
  verification_status text,
  score numeric,
  reasons text[]
)
language sql
stable
set search_path = public
as $function$
with inputs as (
  select
    lower(trim(coalesce(p_markings,''))) as markings,
    lower(trim(coalesce(p_maker,''))) as maker_q,
    lower(trim(coalesce(p_winding,''))) as winding_q
), scored as (
  select
    km.*,
    (
      case
        when i.maker_q = '' then 0
        when lower(km.maker) = i.maker_q then 25
        when lower(km.maker) like '%' || i.maker_q || '%' then 14
        else 0
      end
      + case
        when i.markings = '' then 0
        when lower(trim(km.maker || ' ' || km.calibre)) = i.markings then 32
        when lower(km.calibre) = i.markings then 28
        when lower(km.calibre) like '%' || i.markings || '%' then 18
        when lower(km.maker || ' ' || km.calibre || ' ' || km.calibre_family) like '%' || i.markings || '%' then 12
        when lower(km.search_aliases::text) like '%' || i.markings || '%' then 10
        when lower(km.common_brands::text) like '%' || i.markings || '%' then 8
        else 0
      end
      + case
        when p_diameter_mm is null or km.diameter_mm is null then 0
        when abs(km.diameter_mm - p_diameter_mm) <= 0.10 then 22
        when abs(km.diameter_mm - p_diameter_mm) <= 0.30 then 16
        when abs(km.diameter_mm - p_diameter_mm) <= 0.60 then 9
        when abs(km.diameter_mm - p_diameter_mm) <= 1.00 then 3
        else 0
      end
      + case
        when p_height_mm is null or km.height_mm is null then 0
        when abs(km.height_mm - p_height_mm) <= 0.10 then 14
        when abs(km.height_mm - p_height_mm) <= 0.30 then 9
        when abs(km.height_mm - p_height_mm) <= 0.60 then 4
        else 0
      end
      + case when p_bph is not null and km.bph = p_bph then 18 else 0 end
      + case when i.winding_q <> '' and lower(km.winding) = i.winding_q then 10 else 0 end
      + case when p_jewels is not null and km.jewels = p_jewels then 8 else 0 end
      + case lower(coalesce(km.evidence_grade,''))
          when 'verified' then 10
          when 'manufacturer' then 9
          when 'documented' then 8
          when 'supported' then 5
          when 'candidate' then 1
          when 'generated' then 0
          else 0
        end
    )::numeric as raw_score,
    array_remove(array[
      case when i.maker_q <> '' and lower(km.maker) = i.maker_q then 'Maker exact' when i.maker_q <> '' and lower(km.maker) like '%' || i.maker_q || '%' then 'Maker partial' end,
      case when i.markings <> '' and lower(trim(km.maker || ' ' || km.calibre)) = i.markings then 'Marking exact' when i.markings <> '' and lower(km.calibre) = i.markings then 'Calibre exact' when i.markings <> '' and lower(km.calibre) like '%' || i.markings || '%' then 'Calibre contains marking' when i.markings <> '' and lower(km.search_aliases::text) like '%' || i.markings || '%' then 'Alias match' end,
      case when p_diameter_mm is not null and km.diameter_mm is not null and abs(km.diameter_mm - p_diameter_mm) <= 0.10 then 'Diameter ±0.10 mm' when p_diameter_mm is not null and km.diameter_mm is not null and abs(km.diameter_mm - p_diameter_mm) <= 0.30 then 'Diameter ±0.30 mm' when p_diameter_mm is not null and km.diameter_mm is not null and abs(km.diameter_mm - p_diameter_mm) <= 0.60 then 'Diameter ±0.60 mm' end,
      case when p_height_mm is not null and km.height_mm is not null and abs(km.height_mm - p_height_mm) <= 0.10 then 'Height ±0.10 mm' when p_height_mm is not null and km.height_mm is not null and abs(km.height_mm - p_height_mm) <= 0.30 then 'Height ±0.30 mm' end,
      case when p_bph is not null and km.bph = p_bph then 'BPH exact' end,
      case when i.winding_q <> '' and lower(km.winding) = i.winding_q then 'Winding exact' end,
      case when p_jewels is not null and km.jewels = p_jewels then 'Jewels exact' end,
      case lower(coalesce(km.evidence_grade,'')) when 'verified' then 'Calibre Verified evidence' when 'manufacturer' then 'Manufacturer evidence' when 'documented' then 'Documented evidence' when 'supported' then 'Supported evidence' end
    ], null) as why
  from public.knowledge_movements km
  cross join inputs i
  where
    (i.maker_q = '' or lower(km.maker) like '%' || i.maker_q || '%')
    and (p_diameter_mm is null or km.diameter_mm is null or abs(km.diameter_mm - p_diameter_mm) <= 1.50)
    and (p_height_mm is null or km.height_mm is null or abs(km.height_mm - p_height_mm) <= 1.00)
    and (p_bph is null or km.bph is null or km.bph = p_bph)
    and (i.winding_q = '' or km.winding = '' or lower(km.winding) = i.winding_q)
    and (
      i.markings = ''
      or lower(km.maker || ' ' || km.calibre || ' ' || km.calibre_family) like '%' || i.markings || '%'
      or lower(km.search_aliases::text) like '%' || i.markings || '%'
      or lower(km.common_brands::text) like '%' || i.markings || '%'
    )
)
select
  s.id, s.maker, s.calibre, s.calibre_family, s.diameter_mm, s.height_mm, s.jewels, s.bph,
  s.winding, s.power_reserve_hours, s.escapement, s.evidence_grade, s.verification_status,
  s.raw_score as score, s.why as reasons
from scored s
where s.raw_score > 0
order by s.raw_score desc,
  case lower(coalesce(s.evidence_grade,'')) when 'verified' then 0 when 'manufacturer' then 1 when 'documented' then 2 when 'supported' then 3 when 'candidate' then 4 when 'generated' then 5 else 6 end,
  s.maker, s.calibre
limit greatest(1, least(coalesce(p_limit,25),100));
$function$;

grant execute on function public.find_movement_candidates(text,text,numeric,numeric,integer,integer,text,integer) to authenticated;