"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  createEmptyFloorGeometry,
  type FloorGeometry,
} from "@/types/plan-geometry";

export type FloorActionResult =
  | { ok: true; floor?: FloorSummary; floors?: FloorSummary[]; geometry?: FloorGeometry }
  | { ok: false; error: string };

export type FloorSummary = {
  id: string;
  name: string;
  sort_order: number;
};

async function assertProjectOwner(
  projectId: string,
  userId: string,
): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("owner_id", userId)
    .maybeSingle();
  return Boolean(data);
}

async function listFloors(projectId: string): Promise<FloorSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("floors")
    .select("id, name, sort_order")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });
  return data ?? [];
}

export async function addFloor(
  projectId: string,
  name: string,
): Promise<FloorActionResult> {
  const user = await requireUser();
  if (!(await assertProjectOwner(projectId, user.id))) {
    return { ok: false, error: "Project not found." };
  }
  const trimmed = name.trim() || "Floor";
  const supabase = await createClient();
  const floors = await listFloors(projectId);
  const sort_order =
    floors.length === 0
      ? 0
      : Math.max(...floors.map((f) => f.sort_order)) + 1;

  const { data: floor, error } = await supabase
    .from("floors")
    .insert({ project_id: projectId, name: trimmed, sort_order })
    .select("id, name, sort_order")
    .single();

  if (error || !floor) {
    return { ok: false, error: "Could not add floor." };
  }

  const empty = createEmptyFloorGeometry(trimmed);
  const { error: geoError } = await supabase.from("floor_geometry").insert({
    floor_id: floor.id,
    geometry: empty,
    schema_version: empty.schemaVersion,
  });

  if (geoError) {
    await supabase.from("floors").delete().eq("id", floor.id);
    return { ok: false, error: "Could not create floor geometry." };
  }

  revalidatePath(`/editor/${projectId}`);
  revalidatePath("/dashboard");
  return {
    ok: true,
    floor,
    floors: await listFloors(projectId),
    geometry: empty,
  };
}

export async function renameFloor(
  projectId: string,
  floorId: string,
  name: string,
): Promise<FloorActionResult> {
  const user = await requireUser();
  if (!(await assertProjectOwner(projectId, user.id))) {
    return { ok: false, error: "Project not found." };
  }
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Enter a floor name." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("floors")
    .update({ name: trimmed })
    .eq("id", floorId)
    .eq("project_id", projectId);

  if (error) return { ok: false, error: "Could not rename floor." };

  revalidatePath(`/editor/${projectId}`);
  revalidatePath("/dashboard");
  return { ok: true, floors: await listFloors(projectId) };
}

export async function reorderFloor(
  projectId: string,
  floorId: string,
  direction: "up" | "down",
): Promise<FloorActionResult> {
  const user = await requireUser();
  if (!(await assertProjectOwner(projectId, user.id))) {
    return { ok: false, error: "Project not found." };
  }
  const floors = await listFloors(projectId);
  const idx = floors.findIndex((f) => f.id === floorId);
  if (idx < 0) return { ok: false, error: "Floor not found." };
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= floors.length) {
    return { ok: true, floors };
  }

  const supabase = await createClient();
  const a = floors[idx]!;
  const b = floors[swapIdx]!;
  const { error: e1 } = await supabase
    .from("floors")
    .update({ sort_order: b.sort_order })
    .eq("id", a.id);
  const { error: e2 } = await supabase
    .from("floors")
    .update({ sort_order: a.sort_order })
    .eq("id", b.id);

  if (e1 || e2) return { ok: false, error: "Could not reorder floors." };

  revalidatePath(`/editor/${projectId}`);
  return { ok: true, floors: await listFloors(projectId) };
}

export async function deleteFloor(
  projectId: string,
  floorId: string,
  confirmName: string,
): Promise<FloorActionResult> {
  const user = await requireUser();
  if (!(await assertProjectOwner(projectId, user.id))) {
    return { ok: false, error: "Project not found." };
  }
  const floors = await listFloors(projectId);
  if (floors.length <= 1) {
    return { ok: false, error: "A project must keep at least one floor." };
  }
  const floor = floors.find((f) => f.id === floorId);
  if (!floor) return { ok: false, error: "Floor not found." };
  if (confirmName.trim() !== floor.name) {
    return { ok: false, error: "Type the floor name exactly to confirm." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("floors")
    .delete()
    .eq("id", floorId)
    .eq("project_id", projectId);

  if (error) return { ok: false, error: "Could not delete floor." };

  revalidatePath(`/editor/${projectId}`);
  revalidatePath("/dashboard");
  return { ok: true, floors: await listFloors(projectId) };
}

export async function duplicateFloor(
  projectId: string,
  floorId: string,
): Promise<FloorActionResult> {
  const user = await requireUser();
  if (!(await assertProjectOwner(projectId, user.id))) {
    return { ok: false, error: "Project not found." };
  }
  const floors = await listFloors(projectId);
  const source = floors.find((f) => f.id === floorId);
  if (!source) return { ok: false, error: "Floor not found." };

  const supabase = await createClient();
  const { data: geoRow } = await supabase
    .from("floor_geometry")
    .select("geometry, schema_version")
    .eq("floor_id", floorId)
    .maybeSingle();

  const cloned = JSON.parse(
    JSON.stringify(
      (geoRow?.geometry as FloorGeometry | undefined) ??
        createEmptyFloorGeometry(source.name),
    ),
  ) as FloorGeometry;

  const sort_order = Math.max(...floors.map((f) => f.sort_order)) + 1;
  const name = `${source.name} (copy)`;

  const { data: floor, error } = await supabase
    .from("floors")
    .insert({ project_id: projectId, name, sort_order })
    .select("id, name, sort_order")
    .single();

  if (error || !floor) {
    return { ok: false, error: "Could not duplicate floor." };
  }

  const { error: geoError } = await supabase.from("floor_geometry").insert({
    floor_id: floor.id,
    geometry: cloned,
    schema_version: cloned.schemaVersion,
  });

  if (geoError) {
    await supabase.from("floors").delete().eq("id", floor.id);
    return { ok: false, error: "Could not copy floor geometry." };
  }

  revalidatePath(`/editor/${projectId}`);
  revalidatePath("/dashboard");
  return {
    ok: true,
    floor,
    floors: await listFloors(projectId),
    geometry: cloned,
  };
}

export async function loadFloorGeometry(
  projectId: string,
  floorId: string,
): Promise<FloorActionResult> {
  const user = await requireUser();
  if (!(await assertProjectOwner(projectId, user.id))) {
    return { ok: false, error: "Project not found." };
  }
  const supabase = await createClient();
  const { data: floor } = await supabase
    .from("floors")
    .select("id, name")
    .eq("id", floorId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!floor) return { ok: false, error: "Floor not found." };

  const { data: geoRow } = await supabase
    .from("floor_geometry")
    .select("geometry")
    .eq("floor_id", floorId)
    .maybeSingle();

  const geometry =
    (geoRow?.geometry as FloorGeometry | undefined) ??
    createEmptyFloorGeometry(floor.name);

  return { ok: true, geometry };
}
