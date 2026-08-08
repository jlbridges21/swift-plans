-- Replace published_plans to include style_settings for the public viewer.
-- Keep security_invoker = false (intentional — see init migration comments).
-- Safe to re-run.

create or replace view public.published_plans
with (security_invoker = false)
as
select
  p.public_slug,
  p.name as project_name,
  p.style_settings,
  f.id as floor_id,
  f.name as floor_name,
  f.sort_order,
  fg.geometry,
  fg.schema_version,
  fg.updated_at as geometry_updated_at
from public.projects p
join public.floors f on f.project_id = p.id
join public.floor_geometry fg on fg.floor_id = f.id
where p.publish_status = 'published';

grant select on public.published_plans to anon, authenticated;

comment on view public.published_plans is
  'Public display fields + geometry for published projects only. No owner_id or private columns.';
