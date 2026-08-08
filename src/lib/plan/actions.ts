"use server";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { FloorGeometry } from "@/types/plan-geometry";

export type SaveGeometryResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Persist a floor's geometry document. Ownership enforced by RLS + requireUser.
 * Preserves schemaVersion from the client document (must remain 1 for now).
 */
export async function saveFloorGeometry(
  floorId: string,
  geometry: FloorGeometry,
): Promise<SaveGeometryResult> {
  await requireUser();

  if (!floorId) {
    return { ok: false, error: "Missing floor." };
  }
  if (!geometry || geometry.schemaVersion !== 1) {
    return { ok: false, error: "Invalid floor plan data." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("floor_geometry")
    .update({
      geometry,
      schema_version: geometry.schemaVersion,
    })
    .eq("floor_id", floorId);

  if (error) {
    return { ok: false, error: "Could not save. We’ll keep trying." };
  }

  return { ok: true };
}
