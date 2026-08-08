/**
 * Export pipeline assertions.
 * Run: npm run check:export
 *   or: node scripts/run-check-export.cjs
 *
 * Uses jiti so PlanDrawing (tsx) and @/ aliases resolve under Node.
 */

import assert from "node:assert/strict";
import { XMLParser } from "./_export-xml-parse.ts";
import { sampleFloorGeometry } from "../src/components/plan/sample-plan.ts";
import { planViewBox } from "../src/components/plan/PlanDrawing.tsx";
import {
  EDITOR_CHROME_MARKERS,
} from "../src/lib/export/constants.ts";
import { serializePlanSvg } from "../src/lib/export/serialize-plan.ts";
import { planTokens } from "../src/lib/plan-style/tokens.ts";
import { PLAN_FONT_FAMILY_NAME } from "../src/lib/plan-style/plan-font.ts";
import {
  DEFAULT_PLAN_STYLE,
  type PlanStyleSettings,
} from "../src/lib/plan/style-settings.ts";
import type { PlanBranding } from "../src/lib/plan/branding.ts";

let failures = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ok  ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const branding: PlanBranding = {
  companyName: "Acme Photo Co",
  website: "acme.example.test",
  footerText: "Licensed real-estate photography",
  logoUrl: null,
  logoDataUri: TINY_PNG,
};

const geometry = sampleFloorGeometry;
const style: PlanStyleSettings = { ...DEFAULT_PLAN_STYLE };

console.log("check-export");

const unbranded = serializePlanSvg(geometry, {
  style,
  branded: false,
  branding: null,
});
const branded = serializePlanSvg(geometry, {
  style,
  branded: true,
  branding,
});

// 1. Well-formed XML
{
  const parser = new XMLParser();
  let ok = true;
  let err = "";
  try {
    parser.parse(unbranded);
  } catch (e) {
    ok = false;
    err = e instanceof Error ? e.message : String(e);
  }
  check("1. SVG parses as XML", ok, err);
}

// 2. No CSS custom properties
check("2. No var(--", !unbranded.includes("var(--"));

// 3. No external URL references (allow xmlns + data:)
{
  const stripped = unbranded
    .replace(/xmlns(?::[a-z]+)?="[^"]*"/gi, "")
    .replace(/data:[^"'()\s]+/gi, "DATA_URI");
  const hasHttp = /https?:/i.test(stripped);
  const hasFilePath =
    /(?:href|src|xlink:href)\s*=\s*["'](?:\/(?!\/)|[a-zA-Z]:\\|file:)/i.test(
      unbranded,
    );
  check("3. No external http(s) or file refs", !hasHttp && !hasFilePath);
}

// 4. @font-face with data: URI
check(
  "4. @font-face data URI",
  /@font-face/.test(unbranded) &&
    /url\(data:font\/woff2;base64,/.test(unbranded) &&
    unbranded.includes(PLAN_FONT_FAMILY_NAME),
);

// 5. No editing chrome
{
  let chromeOk = true;
  for (const marker of EDITOR_CHROME_MARKERS) {
    if (unbranded.includes(marker)) {
      chromeOk = false;
      console.error(`    found chrome marker: ${marker}`);
    }
  }
  check("5. No editor chrome markers", chromeOk);
}

// 6. Every room name appears
{
  let allPresent = true;
  for (const room of geometry.rooms) {
    const needle = room.name.toUpperCase();
    if (!unbranded.includes(needle)) {
      allPresent = false;
      console.error(`    missing room: ${room.name}`);
    }
  }
  check("6. All room names present", allPresent);
}

// 7. viewBox finite, positive, includes margin
{
  const m = unbranded.match(/viewBox="([^"]+)"/);
  assert.ok(m, "viewBox present");
  const parts = m![1]!.split(/\s+/).map(Number);
  const [minX, minY, w, h] = parts;
  const expected = planViewBox(geometry, style);
  const margin = planTokens.sheetMargin;
  check(
    "7. viewBox finite/positive/margin",
    parts.every((n) => Number.isFinite(n)) &&
      w! > 0 &&
      h! > 0 &&
      Math.abs(minX! - expected.minX) < 0.01 &&
      Math.abs(minY! - expected.minY) < 0.01 &&
      Math.abs(w! - expected.width) < 0.01 &&
      Math.abs(h! - expected.height) < 0.01 &&
      expected.width >=
        geometry.meta.bounds.maxX - geometry.meta.bounds.minX + margin * 2 - 0.01,
  );
}

// 8. Branding presence / absence; differ only by branding block
{
  const brandStrings = [
    "Acme Photo Co",
    "ACME PHOTO CO",
    "acme.example.test",
    "Licensed real-estate photography",
  ];
  const unbrandedClean = !brandStrings.some((s) => unbranded.includes(s)) &&
    !unbranded.includes('data-plan-branding');
  const brandedHasAll =
    branded.includes("ACME PHOTO CO") &&
    branded.includes("acme.example.test") &&
    branded.includes("Licensed real-estate photography") &&
    branded.includes('data-plan-branding="true"') &&
    branded.includes(TINY_PNG);

  // Strip branding block from branded and compare to unbranded
  const brandingOpen = 'data-plan-branding="true"';
  const start = branded.indexOf(brandingOpen);
  let brandedSans = branded;
  if (start >= 0) {
    const gStart = branded.lastIndexOf("<g", start);
    const gEnd = branded.indexOf("</g>", start);
    if (gStart >= 0 && gEnd >= 0) {
      brandedSans =
        branded.slice(0, gStart) + branded.slice(gEnd + "</g>".length);
    }
  }
  // Normalize insignificant whitespace
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const onlyBrandingDiffers = norm(brandedSans) === norm(unbranded);

  check("8a. Unbranded has no branding strings", unbrandedClean);
  check("8b. Branded contains all branding", brandedHasAll);
  check("8c. Differ only by branding block", onlyBrandingDiffers);
}

// 9. Style settings affect output
{
  const noDims = serializePlanSvg(geometry, {
    style: { ...style, showRoomDimensions: false, showRoomAreas: false },
    branded: false,
  });
  // Dimension strings use a multiplication sign between width and depth
  const dimMarker = " \u00d7 ";
  const withDimsHas = unbranded.includes(dimMarker);
  const withoutDimsLacks = !noDims.includes(dimMarker);
  check(
    "9. Toggling dimensions removes dimension text",
    withDimsHas && withoutDimsLacks,
  );
}

// Approx area labeling
check(
  "extra. Area figures labeled approximate",
  unbranded.includes("≈") &&
    (unbranded.includes("(APPROX)") || unbranded.includes("SQ FT")),
);

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll export checks passed.");
