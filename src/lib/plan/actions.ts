"use server";

import { getUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { FloorGeometry } from "@/types/plan-geometry";

export type SaveGeometryResult =
  | { ok: true }
  | { ok: false; error: string; code?: "auth" | "network" };

/**
 * Persist a floor's geometry document. Ownership enforced by RLS.
 * Preserves schemaVersion from the client document (2 for derived walls).
 */
export async function saveFloorGeometry(
  floorId: string,
  geometry: FloorGeometry,
): Promise<SaveGeometryResult> {
  const user = await getUser();
  if (!user) {
    return {
      ok: false,
      code: "auth",
      error:
        "Your session expired. Sign in again — your local edits are still here.",
    };
  }

  if (!floorId) {
    return { ok: false, error: "Missing floor." };
  }
  if (!geometry || geometry.schemaVersion < 1 || geometry.schemaVersion > 4) {
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
    return {
      ok: false,
      code: "network",
      error: "Could not save. We’ll keep trying — your edits are still here.",
    };
  }

  return { ok: true };
}

export async function saveProjectStyleSettings(
  projectId: string,
  style: Record<string, unknown>,
): Promise<SaveGeometryResult> {
  const user = await getUser();
  if (!user) {
    return {
      ok: false,
      code: "auth",
      error:
        "Your session expired. Sign in again — your local edits are still here.",
    };
  }
  if (!projectId) return { ok: false, error: "Missing project." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({ style_settings: style })
    .eq("id", projectId);

  if (error) {
    return {
      ok: false,
      code: "network",
      error: "Could not save style settings. Your changes are still here.",
    };
  }
  return { ok: true };
}
