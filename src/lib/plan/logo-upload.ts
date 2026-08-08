"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);

export type LogoUploadResult =
  | { ok: true; publicUrl: string }
  | { ok: false; error: string };

export async function uploadBrandingLogo(
  file: File,
  userId: string,
): Promise<LogoUploadResult> {
  if (!ALLOWED.has(file.type)) {
    return {
      ok: false,
      error: "Use a PNG, JPEG, WebP, or SVG image.",
    };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "Logo must be under 2 MB." };
  }

  const ext =
    file.type === "image/png"
      ? "png"
      : file.type === "image/jpeg"
        ? "jpg"
        : file.type === "image/webp"
          ? "webp"
          : "svg";
  const path = `${userId}/logo.${ext}`;
  const supabase = createClient();
  const { error } = await supabase.storage
    .from("branding-logos")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) {
    return {
      ok: false,
      error: "Could not upload the logo. Check your connection and try again.",
    };
  }
  const { data } = supabase.storage.from("branding-logos").getPublicUrl(path);
  return { ok: true, publicUrl: `${data.publicUrl}?t=${Date.now()}` };
}

export function useLogoUpload(userId: string | null) {
  const [busy, setBusy] = useState(false);
  const upload = useCallback(
    async (file: File) => {
      if (!userId) return { ok: false as const, error: "Not signed in." };
      setBusy(true);
      try {
        return await uploadBrandingLogo(file, userId);
      } finally {
        setBusy(false);
      }
    },
    [userId],
  );
  return { upload, busy };
}
