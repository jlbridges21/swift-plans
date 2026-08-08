-- Bump parent projects.updated_at when floors or floor_geometry change.
-- Safe to re-run on an already-migrated database.

-- When a floor row is inserted/updated/deleted, touch the parent project.
create or replace function public.touch_project_from_floor()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- DELETE uses OLD; INSERT/UPDATE use NEW.
  update public.projects
  set updated_at = now()
  where id = coalesce(new.project_id, old.project_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists floors_touch_project on public.floors;
create trigger floors_touch_project
  after insert or update or delete on public.floors
  for each row
  execute function public.touch_project_from_floor();

-- When geometry changes, walk floor → project and bump updated_at.
create or replace function public.touch_project_from_floor_geometry()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_floor_id uuid;
begin
  target_floor_id := coalesce(new.floor_id, old.floor_id);
  update public.projects p
  set updated_at = now()
  from public.floors f
  where f.id = target_floor_id
    and p.id = f.project_id;
  return coalesce(new, old);
end;
$$;

drop trigger if exists floor_geometry_touch_project on public.floor_geometry;
create trigger floor_geometry_touch_project
  after insert or update or delete on public.floor_geometry
  for each row
  execute function public.touch_project_from_floor_geometry();
