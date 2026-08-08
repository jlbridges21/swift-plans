"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createEmptyFloorGeometry } from "@/types/plan-geometry";
import type { FloorGeometry } from "@/types/plan-geometry";

export type ProjectActionState = {
  error?: string;
  success?: string;
};

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function createProject(
  _prev: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const user = await requireUser();
  const name = readString(formData, "name");
  if (!name) {
    return { error: "Enter a name or address for this floor plan." };
  }

  const supabase = await createClient();
  const empty = createEmptyFloorGeometry(name);

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      owner_id: user.id,
      name,
      publish_status: "draft",
    })
    .select("id")
    .single();

  if (projectError || !project) {
    return { error: "Could not create the project. Please try again." };
  }

  const { data: floor, error: floorError } = await supabase
    .from("floors")
    .insert({
      project_id: project.id,
      name: "Floor 1",
      sort_order: 0,
    })
    .select("id")
    .single();

  if (floorError || !floor) {
    await supabase.from("projects").delete().eq("id", project.id);
    return { error: "Could not create the first floor. Please try again." };
  }

  const { error: geometryError } = await supabase.from("floor_geometry").insert({
    floor_id: floor.id,
    geometry: empty,
    schema_version: empty.schemaVersion,
  });

  if (geometryError) {
    await supabase.from("projects").delete().eq("id", project.id);
    return { error: "Could not save the floor plan. Please try again." };
  }

  revalidatePath("/dashboard");
  redirect(`/editor/${project.id}`);
}

export async function renameProject(
  _prev: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  await requireUser();
  const projectId = readString(formData, "projectId");
  const name = readString(formData, "name");
  if (!projectId) {
    return { error: "Missing project." };
  }
  if (!name) {
    return { error: "Enter a name or address." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({ name })
    .eq("id", projectId);

  if (error) {
    return { error: "Could not rename this floor plan. Please try again." };
  }

  revalidatePath("/dashboard");
  revalidatePath(`/editor/${projectId}`);
  return { success: "Renamed." };
}

export async function deleteProject(
  _prev: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  await requireUser();
  const projectId = readString(formData, "projectId");
  const confirmName = readString(formData, "confirmName");
  const expectedName = readString(formData, "expectedName");

  if (!projectId) {
    return { error: "Missing project." };
  }
  if (!confirmName || confirmName !== expectedName) {
    return {
      error: "Type the project name exactly to confirm deletion.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("projects").delete().eq("id", projectId);

  if (error) {
    return { error: "Could not delete this floor plan. Please try again." };
  }

  revalidatePath("/dashboard");
  return { success: "Deleted." };
}

export async function duplicateProject(formData: FormData): Promise<void> {
  const user = await requireUser();
  const projectId = readString(formData, "projectId");
  if (!projectId) {
    return;
  }

  const supabase = await createClient();

  const { data: source, error: sourceError } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (sourceError || !source) {
    return;
  }

  const { data: floors, error: floorsError } = await supabase
    .from("floors")
    .select("id, name, sort_order")
    .eq("project_id", source.id)
    .order("sort_order", { ascending: true });

  if (floorsError || !floors) {
    return;
  }

  const floorIds = floors.map((f) => f.id);
  const { data: geometries, error: geoError } = await supabase
    .from("floor_geometry")
    .select("floor_id, geometry, schema_version")
    .in("floor_id", floorIds);

  if (geoError) {
    return;
  }

  const geoByFloor = new Map(
    (geometries ?? []).map((g) => [g.floor_id, g] as const),
  );

  const { data: copy, error: copyError } = await supabase
    .from("projects")
    .insert({
      owner_id: user.id,
      name: `${source.name} (copy)`,
      publish_status: "draft",
    })
    .select("id")
    .single();

  if (copyError || !copy) {
    return;
  }

  for (const floor of floors) {
    const { data: newFloor, error: newFloorError } = await supabase
      .from("floors")
      .insert({
        project_id: copy.id,
        name: floor.name,
        sort_order: floor.sort_order,
      })
      .select("id")
      .single();

    if (newFloorError || !newFloor) {
      await supabase.from("projects").delete().eq("id", copy.id);
      return;
    }

    const sourceGeo = geoByFloor.get(floor.id);
    const geometryDoc =
      (sourceGeo?.geometry as FloorGeometry | undefined) ??
      createEmptyFloorGeometry(floor.name);
    // Deep copy so the duplicate is fully independent.
    const cloned = JSON.parse(JSON.stringify(geometryDoc)) as FloorGeometry;

    const { error: insertGeoError } = await supabase
      .from("floor_geometry")
      .insert({
        floor_id: newFloor.id,
        geometry: cloned,
        schema_version: sourceGeo?.schema_version ?? cloned.schemaVersion,
      });

    if (insertGeoError) {
      await supabase.from("projects").delete().eq("id", copy.id);
      return;
    }
  }

  revalidatePath("/dashboard");
  redirect(`/editor/${copy.id}`);
}
