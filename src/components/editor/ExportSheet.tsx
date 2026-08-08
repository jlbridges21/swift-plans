"use client";

import { useEffect, useMemo, useState } from "react";
import { planViewBox, PlanDrawing } from "@/components/plan/PlanDrawing";
import { Button } from "@/components/ui/Button";
import { EXPORT_PX_PER_IN } from "@/lib/export/constants";
import { downloadBlob, downloadText } from "@/lib/export/download";
import { exportFilename } from "@/lib/export/filename";
import {
  computeRasterSize,
  RASTER_PRESET_LABELS,
  type RasterPreset,
} from "@/lib/export/raster-scale";
import { BlankRasterError, rasterizePlanSvg } from "@/lib/export/rasterize";
import { serializePlanSvgClient } from "@/lib/export/serialize-plan-client";
import {
  getBrandingSettings,
  saveBrandingSettings,
  type BrandingRow,
} from "@/lib/plan/branding-actions";
import type { PlanBranding } from "@/lib/plan/branding";
import { uploadBrandingLogo } from "@/lib/plan/logo-upload";
import type { PlanStyleSettings } from "@/lib/plan/style-settings";
import type { FloorGeometry } from "@/types/plan-geometry";
import { createClient } from "@/lib/supabase/client";

export type ExportFormat = "svg" | "png" | "jpg" | "pdf";

type ExportSheetProps = {
  projectName: string;
  floorName: string;
  floors: { id: string; name: string }[];
  geometry: FloorGeometry;
  allGeometries: Record<string, FloorGeometry>;
  style: PlanStyleSettings;
  onClose: () => void;
};

async function logoToDataUri(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("read failed"));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function ExportSheet({
  projectName,
  floorName,
  floors,
  geometry,
  allGeometries,
  style,
  onClose,
}: ExportSheetProps) {
  const [format, setFormat] = useState<ExportFormat>("svg");
  const [preset, setPreset] = useState<RasterPreset>("mls");
  const [branded, setBranded] = useState(false);
  const [branding, setBranding] = useState<BrandingRow | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logoDataUri, setLogoDataUri] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState("");
  const [website, setWebsite] = useState("");
  const [footerText, setFooterText] = useState("");

  useEffect(() => {
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      setUserId(data.user?.id ?? null);
      const result = await getBrandingSettings();
      if (result.ok) {
        setBranding(result.branding);
        setCompanyName(result.branding.company_name ?? "");
        setWebsite(result.branding.website ?? "");
        setFooterText(result.branding.footer_text ?? "");
        if (result.branding.logo_url) {
          const uri = await logoToDataUri(result.branding.logo_url);
          setLogoDataUri(uri);
        }
      }
    })();
  }, []);

  const planBranding: PlanBranding | null = useMemo(() => {
    if (!branded) return null;
    return {
      companyName: companyName || branding?.company_name || null,
      logoUrl: branding?.logo_url ?? null,
      logoDataUri,
      website: website || branding?.website || null,
      footerText: footerText || branding?.footer_text || null,
    };
  }, [branded, branding, companyName, website, footerText, logoDataUri]);

  const rasterPreview = useMemo(() => {
    const vb = planViewBox(geometry, style);
    return computeRasterSize(vb.width, vb.height, preset, EXPORT_PX_PER_IN);
  }, [geometry, style, preset]);

  async function handleSaveBranding() {
    setError(null);
    const result = await saveBrandingSettings({
      companyName,
      website,
      footerText,
      enabled: true,
      logoUrl: branding?.logo_url ?? null,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setBranding(result.branding);
    setStatus("Branding saved.");
  }

  async function handleLogo(file: File | null) {
    if (!file || !userId) {
      if (!userId) setError("Sign in again to upload a logo.");
      return;
    }
    setError(null);
    const result = await uploadBrandingLogo(file, userId);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const uri = await logoToDataUri(result.publicUrl);
    setLogoDataUri(uri);
    const saved = await saveBrandingSettings({
      companyName,
      website,
      footerText,
      enabled: true,
      logoUrl: result.publicUrl,
    });
    if (saved.ok) setBranding(saved.branding);
    setStatus("Logo uploaded.");
  }

  async function handleExport() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      if (format === "pdf") {
        const payload = {
          projectName,
          branded,
          branding: planBranding
            ? {
                ...planBranding,
                logoUrl: null,
                logoDataUri: planBranding.logoDataUri,
              }
            : null,
          style,
          floors: floors.map((f) => ({
            name: f.name,
            geometry: allGeometries[f.id]!,
          })),
        };
        sessionStorage.setItem(
          "swift-plans-print-export",
          JSON.stringify(payload),
        );
        window.open("/export/print", "_blank", "noopener,noreferrer");
        setStatus("Print window opened — choose Save as PDF.");
        return;
      }

      setStatus("Rendering plan…");
      const svg = serializePlanSvgClient(geometry, {
        style,
        branded,
        branding: planBranding,
      });
      const name = exportFilename(projectName, floorName, format);

      if (format === "svg") {
        await downloadText(svg, name, "image/svg+xml;charset=utf-8");
        setStatus("SVG downloaded.");
        return;
      }

      setStatus(
        `Creating ${format.toUpperCase()} (${rasterPreview.widthPx}×${rasterPreview.heightPx})…`,
      );
      const { blob, size } = await rasterizePlanSvg(svg, format, preset);
      const how = await downloadBlob(blob, name);
      const dim = `${size.widthPx}×${size.heightPx}`;
      setStatus(
        how === "share"
          ? `Shared ${dim} from Safari — save the image from the share sheet.`
          : `${format.toUpperCase()} downloaded (${dim}).`,
      );
    } catch (err) {
      if (err instanceof BlankRasterError) {
        setError(err.message);
      } else {
        setError(
          err instanceof Error
            ? err.message
            : "Export failed. Check your connection and try again.",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  const isRaster = format === "png" || format === "jpg";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-navy/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-sheet-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Dismiss"
        onClick={onClose}
      />
      <div
        className={[
          "pointer-events-auto relative z-10 flex w-full max-w-lg flex-col gap-4",
          "max-h-[90dvh] overflow-y-auto rounded-t-lg border border-border bg-elevated p-5 shadow-card sm:rounded-lg",
          "pb-[max(1.25rem,env(safe-area-inset-bottom))]",
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-3">
          <h2
            id="export-sheet-title"
            className="text-lg font-semibold text-navy"
          >
            Export
          </h2>
          <button
            type="button"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-sm text-fg-muted hover:bg-tinted"
            aria-label="Close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-navy">Format</h3>
          <div className="flex flex-wrap gap-2">
            {(["svg", "png", "jpg", "pdf"] as ExportFormat[]).map((f) => (
              <Button
                key={f}
                type="button"
                variant={format === f ? "primary" : "secondary"}
                onClick={() => setFormat(f)}
              >
                {f.toUpperCase()}
              </Button>
            ))}
          </div>
          <p className="text-xs text-fg-muted">
            SVG, PNG, and JPG export the current floor. PDF includes every floor
            (one page each) via print.
          </p>
        </section>

        {isRaster ? (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-navy">Resolution</h3>
            <div className="flex flex-wrap gap-2">
              {(["web", "mls", "print"] as RasterPreset[]).map((p) => (
                <Button
                  key={p}
                  type="button"
                  variant={preset === p ? "primary" : "secondary"}
                  onClick={() => setPreset(p)}
                >
                  {RASTER_PRESET_LABELS[p]}
                </Button>
              ))}
            </div>
            <p className="text-xs text-fg-muted">
              Output size: {rasterPreview.widthPx}×{rasterPreview.heightPx} px
              {rasterPreview.clamped
                ? " (scaled down to fit this device safely)"
                : ""}
            </p>
          </section>
        ) : null}

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-navy">Branding</h3>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={!branded ? "primary" : "secondary"}
              onClick={() => setBranded(false)}
            >
              Unbranded
            </Button>
            <Button
              type="button"
              variant={branded ? "primary" : "secondary"}
              onClick={() => setBranded(true)}
            >
              Branded
            </Button>
          </div>
          {branded ? (
            <div className="mt-2 flex flex-col gap-3 rounded-sm border border-border p-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-navy">Company name</span>
                <input
                  className="min-h-[44px] rounded-sm border border-border px-3"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-navy">Website</span>
                <input
                  className="min-h-[44px] rounded-sm border border-border px-3"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-navy">Footer text</span>
                <input
                  className="min-h-[44px] rounded-sm border border-border px-3"
                  value={footerText}
                  onChange={(e) => setFooterText(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-navy">Logo</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="min-h-[44px] text-sm"
                  onChange={(e) => void handleLogo(e.target.files?.[0] ?? null)}
                />
              </label>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleSaveBranding()}
              >
                Save branding
              </Button>
            </div>
          ) : (
            <p className="text-xs text-fg-muted">
              Unbranded is the MLS default — no logo, company name, or marks.
            </p>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-navy">Preview</h3>
          <div className="overflow-hidden rounded-sm border border-border bg-white">
            <PlanDrawing
              geometry={geometry}
              style={style}
              branding={planBranding}
              embedFont={false}
            />
          </div>
        </section>

        {status ? <p className="text-sm text-fg-muted">{status}</p> : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <Button
          type="button"
          className="w-full"
          disabled={busy}
          onClick={() => void handleExport()}
        >
          {busy ? "Working…" : `Export ${format.toUpperCase()}`}
        </Button>
      </div>
    </div>
  );
}
