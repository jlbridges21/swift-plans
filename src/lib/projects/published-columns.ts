/**
 * Columns exposed by published_plans — keep in sync with the view migration.
 * Pure module (no Next/Supabase imports) for check scripts.
 */

export const PUBLISHED_PLAN_COLUMNS = [
  "public_slug",
  "project_name",
  "style_settings",
  "floor_id",
  "floor_name",
  "sort_order",
  "geometry",
  "schema_version",
  "geometry_updated_at",
] as const;

export type PublishedPlanColumn = (typeof PUBLISHED_PLAN_COLUMNS)[number];

/** Returns null for blank / whitespace-only slugs. */
export function normalizePublicSlug(slug: string): string | null {
  const trimmed = slug.trim();
  return trimmed.length > 0 ? trimmed : null;
}
