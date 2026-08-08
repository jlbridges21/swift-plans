/**
 * Shared TypeScript types.
 * Geometry graph types land in Phase 2+. Keep this file for app-wide shapes.
 */

export type PublishStatus = "draft" | "published";

export type Project = {
  id: string;
  owner_id: string;
  name: string;
  publish_status: PublishStatus;
  public_slug: string;
  created_at: string;
  updated_at: string;
};

export type Floor = {
  id: string;
  project_id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type FloorGeometry = {
  id: string;
  floor_id: string;
  geometry: Record<string, unknown>;
  schema_version: number;
  updated_at: string;
};

export type BrandingSettings = {
  id: string;
  owner_id: string;
  company_name: string | null;
  logo_url: string | null;
  website: string | null;
  footer_text: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};
