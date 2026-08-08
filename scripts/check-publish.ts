/**
 * Raster clamp + published_plans column assertions.
 * Run: npm run check:publish
 *   or: node --experimental-strip-types scripts/check-publish.ts
 */

import {
  computeRasterSize,
  RASTER_MAX_AREA_PX,
  RASTER_MAX_SIDE_PX,
  RASTER_PRESET_PX_PER_IN,
  rasterSizeWithinLimits,
  type RasterPreset,
} from "../src/lib/export/raster-scale.ts";
import { EXPORT_PX_PER_IN } from "../src/lib/export/constants.ts";
import {
  normalizePublicSlug,
  PUBLISHED_PLAN_COLUMNS,
} from "../src/lib/projects/published-columns.ts";

let failures = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) console.log(`  ok  ${label}`);
  else {
    failures += 1;
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("check-publish");

// 1. Raster clamp on a large plan
{
  const largeW = 1036.75;
  const largeH = 604.75;
  const presets: RasterPreset[] = ["web", "mls", "print"];
  const sizes = Object.fromEntries(
    presets.map((p) => [
      p,
      computeRasterSize(largeW, largeH, p, EXPORT_PX_PER_IN),
    ]),
  ) as Record<RasterPreset, ReturnType<typeof computeRasterSize>>;

  for (const p of presets) {
    const s = sizes[p]!;
    check(
      `1. ${p} within side/area limits (${s.widthPx}x${s.heightPx})`,
      rasterSizeWithinLimits(s),
    );
  }

  check(
    "1b. Print is largest preset that fits",
    sizes.print!.widthPx >= sizes.mls!.widthPx &&
      sizes.mls!.widthPx >= sizes.web!.widthPx,
  );

  const rawArea =
    largeW *
    RASTER_PRESET_PX_PER_IN.print *
    (largeH * RASTER_PRESET_PX_PER_IN.print);
  check(
    "1c. Large Print is clamped under Safari caps",
    sizes.print!.clamped &&
      sizes.print!.widthPx <= RASTER_MAX_SIDE_PX &&
      sizes.print!.widthPx * sizes.print!.heightPx <= RASTER_MAX_AREA_PX &&
      rawArea > RASTER_MAX_AREA_PX,
  );
}

// 2. Small plan not upscaled
{
  const small = computeRasterSize(120, 96, "print", EXPORT_PX_PER_IN);
  check(
    "2. Small plan not upscaled beyond Print PPI",
    small.pxPerIn <= RASTER_PRESET_PX_PER_IN.print + 1e-6 && !small.clamped,
  );
}

// 3. Slug handling (pure)
{
  check("3a. Empty slug → nothing", normalizePublicSlug("   ") === null);
  check("3b. Valid slug preserved", normalizePublicSlug(" abc-123 ") === "abc-123");
}

// 4. Column list — no private fields
{
  const cols = PUBLISHED_PLAN_COLUMNS as readonly string[];
  const forbidden = [
    "owner_id",
    "email",
    "password",
    "logo_url",
    "company_name",
    "website",
    "footer_text",
  ];
  check(
    "4. No private columns in published select list",
    forbidden.every((f) => !cols.includes(f)),
  );
  check(
    "4b. Required display columns present",
    [
      "public_slug",
      "project_name",
      "style_settings",
      "floor_id",
      "floor_name",
      "sort_order",
      "geometry",
    ].every((c) => cols.includes(c)),
  );
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll publish/raster checks passed.");
