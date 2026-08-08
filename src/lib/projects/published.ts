/**
 * Load a published plan for the public viewer via published_plans (anon-safe).
 */

import { createClient } from "@/lib/supabase/server";
import {
  normalizePlanStyle,
  type PlanStyleSettings,
} from "@/lib/plan/style-settings";
import type { FloorGeometry } from "@/types/plan-geometry";
import {
  normalizePublicSlug,
  PUBLISHED_PLAN_COLUMNS,
} from "@/lib/projects/published-columns";

export {
  PUBLISHED_PLAN_COLUMNS,
  normalizePublicSlug,
} from "@/lib/projects/published-columns";

export type PublishedFloor = {
  id: string;
  name: string;
  sortOrder: number;
  geometry: FloorGeometry;
};

export type PublishedPlan = {
  publicSlug: string;
  projectName: string;
  style: PlanStyleSettings;
  floors: PublishedFloor[];
};

type PublishedRow = {
  public_slug: string;
  project_name: string;
  style_settings: unknown;
  floor_id: string;
  floor_name: string;
  sort_order: number;
  geometry: FloorGeometry;
  schema_version: number;
  geometry_updated_at: string;
};

/**
 * Returns null for unknown, unpublished, or empty results — never leaks existence.
 */
export async function getPublishedPlanBySlug(
  slug: string,
): Promise<PublishedPlan | null> {
  const trimmed = normalizePublicSlug(slug);
  if (!trimmed) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("published_plans")
    .select(PUBLISHED_PLAN_COLUMNS.join(", "))
    .eq("public_slug", trimmed)
    .order("sort_order", { ascending: true });

  if (error || !data || data.length === 0) return null;

  const rows = data as unknown as PublishedRow[];
  const first = rows[0]!;
  const floors: PublishedFloor[] = rows.map((row) => ({
    id: row.floor_id,
    name: row.floor_name,
    sortOrder: row.sort_order,
    geometry: row.geometry,
  }));

  return {
    publicSlug: first.public_slug,
    projectName: first.project_name,
    style: normalizePlanStyle(first.style_settings),
    floors,
  };
}
