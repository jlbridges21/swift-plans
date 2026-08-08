"use server";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type BrandingRow = {
  company_name: string | null;
  logo_url: string | null;
  website: string | null;
  footer_text: string | null;
  enabled: boolean;
};

export type BrandingResult =
  | { ok: true; branding: BrandingRow }
  | { ok: false; error: string };

const EMPTY: BrandingRow = {
  company_name: null,
  logo_url: null,
  website: null,
  footer_text: null,
  enabled: false,
};

export async function getBrandingSettings(): Promise<BrandingResult> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("branding_settings")
    .select("company_name, logo_url, website, footer_text, enabled")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (error) return { ok: false, error: "Could not load branding." };
  return { ok: true, branding: data ?? EMPTY };
}

export async function saveBrandingSettings(input: {
  companyName: string;
  website: string;
  footerText: string;
  enabled: boolean;
  logoUrl: string | null;
}): Promise<BrandingResult> {
  const user = await requireUser();
  const supabase = await createClient();
  const row = {
    owner_id: user.id,
    company_name: input.companyName.trim() || null,
    website: input.website.trim() || null,
    footer_text: input.footerText.trim() || null,
    enabled: input.enabled,
    logo_url: input.logoUrl,
  };
  const { data, error } = await supabase
    .from("branding_settings")
    .upsert(row, { onConflict: "owner_id" })
    .select("company_name, logo_url, website, footer_text, enabled")
    .single();
  if (error || !data) {
    return { ok: false, error: "Could not save branding." };
  }
  return { ok: true, branding: data };
}
