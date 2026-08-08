import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { livingAreaSqFt } from "@/lib/plan/area";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { NewProjectForm } from "@/components/projects/NewProjectForm";
import {
  ProjectCard,
  type ProjectListItem,
} from "@/components/projects/ProjectCard";
import type { FloorGeometry } from "@/types/plan-geometry";

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  searchParams: Promise<{ q?: string; sort?: string }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const user = await requireUser();
  const params = await searchParams;
  const query = (params.q ?? "").trim().toLowerCase();
  const sort = params.sort === "name" ? "name" : "updated";

  const supabase = await createClient();

  let projectQuery = supabase
    .from("projects")
    .select("id, name, updated_at, created_at")
    .eq("owner_id", user.id);

  if (sort === "name") {
    projectQuery = projectQuery.order("name", { ascending: true });
  } else {
    projectQuery = projectQuery.order("updated_at", { ascending: false });
  }

  const { data: projects, error } = await projectQuery;

  if (error) {
    return (
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-4 py-8">
        <h1 className="text-3xl font-semibold tracking-tight text-navy">
          Your floor plans
        </h1>
        <p className="text-danger">
          Could not load your projects. Please refresh and try again.
        </p>
      </section>
    );
  }

  const filtered = (projects ?? []).filter((p) =>
    query ? p.name.toLowerCase().includes(query) : true,
  );

  const projectIds = filtered.map((p) => p.id);
  const floorCountByProject = new Map<string, number>();
  const areaByProject = new Map<string, number | null>();

  if (projectIds.length > 0) {
    const { data: floors } = await supabase
      .from("floors")
      .select("id, project_id")
      .in("project_id", projectIds);

    for (const floor of floors ?? []) {
      floorCountByProject.set(
        floor.project_id,
        (floorCountByProject.get(floor.project_id) ?? 0) + 1,
      );
    }

    const floorIds = (floors ?? []).map((f) => f.id);
    if (floorIds.length > 0) {
      const { data: geos } = await supabase
        .from("floor_geometry")
        .select("floor_id, geometry")
        .in("floor_id", floorIds);

      const floorToProject = new Map(
        (floors ?? []).map((f) => [f.id, f.project_id] as const),
      );

      for (const geo of geos ?? []) {
        const projectId = floorToProject.get(geo.floor_id);
        if (!projectId) continue;
        const doc = geo.geometry as FloorGeometry;
        const area = livingAreaSqFt(doc);
        if (area === null) {
          if (!areaByProject.has(projectId)) {
            areaByProject.set(projectId, null);
          }
          continue;
        }
        areaByProject.set(
          projectId,
          (areaByProject.get(projectId) ?? 0) + area,
        );
      }
    }
  }

  const items: ProjectListItem[] = filtered.map((p) => {
    const area = areaByProject.get(p.id);
    const floorCount = floorCountByProject.get(p.id) ?? 0;
    return {
      id: p.id,
      name: p.name,
      floorCount,
      areaLabel:
        area === null || area === undefined
          ? "—"
          : `${Math.round(area).toLocaleString()} sq ft`,
      updatedLabel: formatRelativeTime(p.updated_at),
    };
  });

  const isEmpty = (projects ?? []).length === 0;

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 py-2">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-navy">
            Your floor plans
          </h1>
          <p className="text-base text-fg-muted">
            Create and manage floor plans for your listings.
          </p>
        </div>
      </header>

      {isEmpty ? (
        <div className="flex flex-col gap-6 rounded-lg border border-border bg-elevated p-8 shadow-card">
          <div className="flex max-w-lg flex-col gap-2">
            <h2 className="text-xl font-semibold text-navy">
              Create your first floor plan
            </h2>
            <p className="text-sm leading-relaxed text-fg-muted">
              Start with a name or property address. You can add rooms in the
              editor next.
            </p>
          </div>
          <NewProjectForm />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-4 rounded-lg border border-border bg-elevated p-5 shadow-card sm:flex-row sm:items-end sm:justify-between">
            <div className="w-full sm:max-w-md">
              <NewProjectForm compact />
            </div>
          </div>

          <form
            method="get"
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <label className="flex w-full flex-col gap-1.5 text-sm sm:max-w-xs">
              <span className="font-medium text-navy">Search</span>
              <input
                name="q"
                defaultValue={params.q ?? ""}
                placeholder="Search by name"
                className="min-h-[var(--sp-touch-min)] rounded-sm border border-border bg-elevated px-3 text-base"
              />
            </label>
            <label className="flex w-full flex-col gap-1.5 text-sm sm:max-w-[12rem]">
              <span className="font-medium text-navy">Sort</span>
              <select
                name="sort"
                defaultValue={sort}
                className="min-h-[var(--sp-touch-min)] rounded-sm border border-border bg-elevated px-3 text-base"
              >
                <option value="updated">Last updated</option>
                <option value="name">Name</option>
              </select>
            </label>
            <button
              type="submit"
              className="inline-flex min-h-[var(--sp-touch-min)] items-center justify-center rounded-sm bg-accent px-4 text-sm font-medium text-accent-fg"
            >
              Apply
            </button>
          </form>

          {items.length === 0 ? (
            <p className="text-sm text-fg-muted">
              No floor plans match “{params.q}”.{" "}
              <Link href="/dashboard" className="text-accent hover:underline">
                Clear search
              </Link>
            </p>
          ) : (
            <ul className="flex flex-col gap-4">
              {items.map((project) => (
                <li key={project.id}>
                  <ProjectCard project={project} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
