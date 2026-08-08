-- Swift Plans — Phase 0 schema
-- Run this in the Supabase SQL editor (or via the Supabase CLI).
-- Creates projects, floors, floor_geometry, branding_settings + RLS + public view.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Listing / floor-plan projects owned by a single authenticated user.
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  -- Display name; typically the property address or a short listing label.
  name text not null,
  -- draft | published. Only published projects are visible via the public view.
  publish_status text not null default 'draft'
    check (publish_status in ('draft', 'published')),
  -- Non-guessable public identifier (UUID). Not a sequential integer.
  public_slug uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_owner_id_idx on public.projects (owner_id);

-- One or more floors belonging to a project (multi-floor comes in a later phase).
create table public.floors (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null default 'Floor 1',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index floors_project_id_idx on public.floors (project_id);

-- One cohesive geometry JSONB document per floor.
-- schema_version lets us evolve the geometry format without a hard cutover.
create table public.floor_geometry (
  id uuid primary key default gen_random_uuid(),
  floor_id uuid not null unique references public.floors (id) on delete cascade,
  geometry jsonb not null default '{}'::jsonb,
  schema_version integer not null default 1,
  updated_at timestamptz not null default now()
);

-- Per-owner branding used on branded exports (Phase 8). One row per owner.
create table public.branding_settings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users (id) on delete cascade,
  company_name text,
  logo_url text,
  website text,
  footer_text text,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

create trigger floors_set_updated_at
  before update on public.floors
  for each row execute function public.set_updated_at();

create trigger floor_geometry_set_updated_at
  before update on public.floor_geometry
  for each row execute function public.set_updated_at();

create trigger branding_settings_set_updated_at
  before update on public.branding_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security (default-deny; explicit owner policies only)
-- ---------------------------------------------------------------------------
alter table public.projects enable row level security;
alter table public.floors enable row level security;
alter table public.floor_geometry enable row level security;
alter table public.branding_settings enable row level security;

-- No grants beyond what Supabase already gives authenticated/anon for table
-- access under RLS. Policies below are the allow-list.

-- projects: owner full access
-- Policy: an authenticated user may only see their own projects.
create policy "projects_select_own"
  on public.projects for select
  to authenticated
  using (owner_id = auth.uid());

-- Policy: an authenticated user may only insert projects they own.
create policy "projects_insert_own"
  on public.projects for insert
  to authenticated
  with check (owner_id = auth.uid());

-- Policy: an authenticated user may only update their own projects.
create policy "projects_update_own"
  on public.projects for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Policy: an authenticated user may only delete their own projects.
create policy "projects_delete_own"
  on public.projects for delete
  to authenticated
  using (owner_id = auth.uid());

-- floors: access via parent project ownership
-- Policy: owners can read floors of their projects.
create policy "floors_select_own"
  on public.floors for select
  to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = floors.project_id and p.owner_id = auth.uid()
    )
  );

-- Policy: owners can insert floors under their projects.
create policy "floors_insert_own"
  on public.floors for insert
  to authenticated
  with check (
    exists (
      select 1 from public.projects p
      where p.id = floors.project_id and p.owner_id = auth.uid()
    )
  );

-- Policy: owners can update floors under their projects.
create policy "floors_update_own"
  on public.floors for update
  to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = floors.project_id and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = floors.project_id and p.owner_id = auth.uid()
    )
  );

-- Policy: owners can delete floors under their projects.
create policy "floors_delete_own"
  on public.floors for delete
  to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = floors.project_id and p.owner_id = auth.uid()
    )
  );

-- floor_geometry: access via floor → project ownership
-- Policy: owners can read geometry for floors they own.
create policy "floor_geometry_select_own"
  on public.floor_geometry for select
  to authenticated
  using (
    exists (
      select 1
      from public.floors f
      join public.projects p on p.id = f.project_id
      where f.id = floor_geometry.floor_id and p.owner_id = auth.uid()
    )
  );

-- Policy: owners can insert geometry for floors they own.
create policy "floor_geometry_insert_own"
  on public.floor_geometry for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.floors f
      join public.projects p on p.id = f.project_id
      where f.id = floor_geometry.floor_id and p.owner_id = auth.uid()
    )
  );

-- Policy: owners can update geometry for floors they own.
create policy "floor_geometry_update_own"
  on public.floor_geometry for update
  to authenticated
  using (
    exists (
      select 1
      from public.floors f
      join public.projects p on p.id = f.project_id
      where f.id = floor_geometry.floor_id and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.floors f
      join public.projects p on p.id = f.project_id
      where f.id = floor_geometry.floor_id and p.owner_id = auth.uid()
    )
  );

-- Policy: owners can delete geometry for floors they own.
create policy "floor_geometry_delete_own"
  on public.floor_geometry for delete
  to authenticated
  using (
    exists (
      select 1
      from public.floors f
      join public.projects p on p.id = f.project_id
      where f.id = floor_geometry.floor_id and p.owner_id = auth.uid()
    )
  );

-- branding_settings: owner full access
-- Policy: owners can read their own branding settings.
create policy "branding_settings_select_own"
  on public.branding_settings for select
  to authenticated
  using (owner_id = auth.uid());

-- Policy: owners can insert their own branding settings.
create policy "branding_settings_insert_own"
  on public.branding_settings for insert
  to authenticated
  with check (owner_id = auth.uid());

-- Policy: owners can update their own branding settings.
create policy "branding_settings_update_own"
  on public.branding_settings for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Policy: owners can delete their own branding settings.
create policy "branding_settings_delete_own"
  on public.branding_settings for delete
  to authenticated
  using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Public read path (published plans only)
--
-- WHY A VIEW (not a table RLS policy):
-- Postgres RLS is row-level, not column-level. A SELECT policy on `projects`
-- for published rows would still expose owner_id and other private columns.
-- A narrow view exposes only display fields + geometry for published plans,
-- and nothing else. The view runs with owner privileges so it can read
-- underlying rows; the WHERE clause is the security boundary. Base tables
-- remain default-deny for anon via RLS.
-- ---------------------------------------------------------------------------
create or replace view public.published_plans
with (security_invoker = false)
as
select
  p.public_slug,
  p.name as project_name,
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

-- Allow anyone (anon + authenticated) to read the narrow public view only.
grant select on public.published_plans to anon, authenticated;

-- Explicitly: no anon policies on the base tables. Anon SELECT on projects /
-- floors / floor_geometry / branding_settings returns zero rows (default-deny).
