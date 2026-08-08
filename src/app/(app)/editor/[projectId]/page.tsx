import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PlanDrawing } from "@/components/plan/PlanDrawing";
import { RenameProjectForm } from "@/components/projects/ProjectManageForms";
import {
  createEmptyFloorGeometry,
  type FloorGeometry,
} from "@/types/plan-geometry";

export const dynamic = "force-dynamic";

type EditorPageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function EditorPage({ params }: EditorPageProps) {
  const user = await requireUser();
  const { projectId } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, owner_id")
    .eq("id", projectId)
    .maybeSingle();

  // Same message whether missing or not owned — do not leak existence.
  if (!project || project.owner_id !== user.id) {
    return (
      <section className="mx-auto flex w-full max-w-lg flex-1 flex-col items-start justify-center gap-4 px-5 py-16">
        <h1 className="text-2xl font-semibold tracking-tight text-navy">
          This floor plan isn’t available
        </h1>
        <p className="text-base text-fg-muted">
          It may have been deleted, or you don’t have access.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex min-h-[var(--sp-touch-min)] items-center text-sm font-medium text-accent hover:underline"
        >
          Back to dashboard
        </Link>
      </section>
    );
  }

  const { data: floors } = await supabase
    .from("floors")
    .select("id, name, sort_order")
    .eq("project_id", project.id)
    .order("sort_order", { ascending: true });

  if (!floors || floors.length === 0) {
    notFound();
  }

  const activeFloor = floors[0];
  const { data: geoRow } = await supabase
    .from("floor_geometry")
    .select("geometry")
    .eq("floor_id", activeFloor.id)
    .maybeSingle();

  const geometry: FloorGeometry =
    (geoRow?.geometry as FloorGeometry | undefined) ??
    createEmptyFloorGeometry(project.name);

  return (
    <div className="flex w-full flex-1 flex-col">
      <div className="border-b border-border bg-elevated">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="flex min-w-0 flex-col gap-2">
            <Link
              href="/dashboard"
              className="text-sm font-medium text-accent hover:underline"
            >
              ← Dashboard
            </Link>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <h1 className="truncate text-xl font-semibold tracking-tight text-navy">
                {project.name}
              </h1>
              <RenameProjectForm projectId={project.id} name={project.name} />
            </div>
          </div>
          <p className="text-sm text-fg-muted" aria-live="polite">
            Saved
          </p>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-5 py-6 sm:px-8">
        {floors.length > 1 ? (
          <div className="flex flex-wrap gap-2" aria-label="Floors">
            {floors.map((floor) => (
              <span
                key={floor.id}
                className={[
                  "inline-flex min-h-[var(--sp-touch-min)] items-center rounded-sm border px-3 text-sm",
                  floor.id === activeFloor.id
                    ? "border-accent bg-tinted text-accent"
                    : "border-border text-fg-muted",
                ].join(" ")}
              >
                {floor.name}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-fg-muted">{activeFloor.name}</p>
        )}

        <div className="overflow-hidden rounded-lg border border-border bg-elevated shadow-card">
          <PlanDrawing geometry={geometry} />
        </div>

        <aside
          className="rounded-lg border border-dashed border-border-strong bg-background px-5 py-6"
          aria-label="Drawing tools placeholder"
        >
          <p className="text-sm font-medium text-navy">Drawing tools</p>
          <p className="mt-1 text-sm text-fg-muted">
            Drawing tools arrive next. This space is reserved for room creation
            and editing controls.
          </p>
        </aside>
      </div>
    </div>
  );
}
