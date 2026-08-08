import { notFound } from "next/navigation";
import Link from "next/link";
import { EditorClient } from "@/components/editor/EditorClient";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
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
    <EditorClient
      projectId={project.id}
      projectName={project.name}
      floorId={activeFloor.id}
      floors={floors}
      initialGeometry={geometry}
    />
  );
}
