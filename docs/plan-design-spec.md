# Plan design specification

Visual target for Swift Plans exports and editor rendering. The reference
rendering lives at `/debug/plan-style`. Tokens live in
`src/lib/plan-style/tokens.ts`. The typed geometry document is
`src/types/plan-geometry.ts`.

## Presentation style (single)

**Textured architectural** is the locked look:

- Cool white paper (`#ffffff`) and brand navy ink (`#0f172a`) — never pure
  black-on-cream, never tied to app UI theme or `prefers-color-scheme`
- Subtle cool tonal room fills derived from `#f8fafc` / `#eff6ff`
- Dimensions in brand gray (`#64748b`); symbols in a lighter navy tint
- Floor texture at ~3.5% opacity, by room type:
  - **Plank** (wide parallel lines, room long-axis): living room, dining,
    bedroom, entry
  - **Tile** (fine square grid): bathroom, kitchen, laundry
  - **None**: garage, closet, hallway
- Total living area as a typographic footer element (garage excluded)
- Unbranded by default — no logo or company name on the plan document

Closed exterior walls are filled as **separate outer/inner SVG subpaths** with
`fill-rule="evenodd"`. A single concatenated subpath drops the wrap-around
segment (the bug that erased the west wall in Phase 1.5a).

Plan SVG text uses a **literal** `PLAN_FONT_FAMILY` stack — no CSS custom
properties inside the SVG, so serialized exports do not silently fall back.

---

## Token list (intent)

| Token | Intent |
| --- | --- |
| `paper` | Document ground — warm off-white; never pure white; independent of app theme |
| `ink` / `inkMuted` / `inkSubtle` | Structure / labels / dimensions |
| `stroke.emphasis` / `fixture` / `annotation` | Named stroke hierarchy for symbols |
| `wallExterior` / `wallInterior` | Filled wall thicknesses in drawing inches |
| `fill.living` / `wet` / `service` | Tonal room fills by category |
| `textureOpacity` | ~3–4% floor texture; do not multiply up |
| `plankSpacing` / `tileSpacing` | Material pattern scale |
| `typography.*` | Label / dimension / area sizes and tracking |
| `sheetMargin` | Breathing room around the footprint in the viewBox |
| `doorSwing.stroke` / `window.*` | Symbol line weights and window inset ratio |
| `PLAN_FONT_FAMILY` | Literal font stack for export-safe SVG text |

**Drawing space:** 1 SVG user unit = **1 inch** (1:1 with stored measurements).

---

## Geometry document schema (`FloorGeometry`)

Source of truth: `src/types/plan-geometry.ts`. The sample plan is a typed
instance (`sampleFloorGeometry`). `PlanDrawing` renders only from a
`geometry` prop.

### Root

| Field | Why the renderer needs it |
| --- | --- |
| `schemaVersion` | Evolve the JSONB format without a hard cutover |
| `meta.title` | Accessible label / sheet title |
| `meta.bounds` | viewBox and sheet framing before margin |

### `walls[]`

| Field | Why |
| --- | --- |
| `id` | Stable reference for doors/windows/openings |
| `centerline` | Source polyline for mitered filled poché |
| `thickness` | Outer/inner offset distance |
| `kind` | Exterior vs interior visual weight (and default thickness) |
| `closed` | Closed shell uses two rings + evenodd; open runs use a strip ring |

**Not yet modeled (Phase 2 hard cases):** shared-wall identity between two
rooms, and T-junction vertex graphs. Walls are independent centerlines today;
joins overdraw. Phase 2 should add adjacency/junctions without breaking `id` +
centerline attachments.

### `rooms[]`

| Field | Why |
| --- | --- |
| `id` | Stable identity |
| `name` | Uppercase label text |
| `type` | Drives floor texture (plank / tile / none) |
| `category` | Drives tonal fill |
| `polygon` | Floor fill + area (shoelace) + AABB dimensions |
| `labelAnchor` | Placed label; centroids fail on L-shapes |

### `doors[]`

| Field | Why |
| --- | --- |
| `id` | Stable identity |
| `wallId` | Host wall for opening placement |
| `offset` | Distance along wall centerline to opening start |
| `width` | Opening width (= swing arc radius) |
| `hingeSide` | Which end of the opening is the hinge (`start` \| `end`) |
| `swingSide` | Which side of the wall the leaf arcs into (`1` \| `-1`) |
| `exterior` | Entry vs interior (opening cut weight) |

### `windows[]`

| Field | Why |
| --- | --- |
| `id` | Stable identity |
| `wallId` | Host wall |
| `offset` / `width` | Opening along centerline |
| (thickness from wall) | Parallel pane lines inset into the wall body |

### `openings[]`

Cased openings without a door leaf — same attachment fields as windows
(`wallId`, `offset`, `width`). Empty in the sample.

### `stairs[]`

| Field | Why |
| --- | --- |
| `id` | Stable identity |
| `polygon` | Stair run / well outline |
| `direction` | Ascent direction for tread symbol orientation |

Empty in the sample (single-story reference).

### `labels[]`

Free-floating annotations (`note` \| `dimension` \| `area`) not tied to a room
centroid. Empty in the sample (room labels come from `rooms[]`).

### Units

- All geometry in **inches**
- Drawing space inches == stored inches (1:1)
- Feet/inches formatting only at display/export text time

---

## Geometry checks

`npm run check:plan-geometry` runs computable assertions (wall coverage
including closed wrap-around, room centroids outside walls, door radius/width,
area sanity, finite coordinates). Phases 2–4 should extend this script rather
than relying on visual self-assessment.

---

## Hand-faked / hard-later notes

1. **T-junctions and wall end caps** — Interior runs butt-cap and overdraw the
   shell. A real solver must clip/miter ends into the host wall.
2. **Door openings cutting walls** — Paper-colored stroke over the wall, then
   redraw swing. Production should boolean-subtract or split the wall run.
3. **Label anchors** — Hand-placed for L-shapes; auto-placement is later.
4. **Dimension strings** — AABB width×depth stopgap, not measured wall lengths.
5. **Shared house/garage wall** — Extra exterior-weight segment at a T.
6. **Fonts in exported SVG** — Literal system stack for now; Phase 8 must
   embed a subset or convert text to paths (see recommendation below).
7. **Hatch patterns** — SVG `<pattern>` clipped to room polygons at ~3.5%
   opacity.

---

## Font recommendation (do not install in this phase)

**Recommendation: [IBM Plex Sans](https://github.com/IBM/plex)** (SIL OFL),
self-hosted and subset for exports. Until Phase 8, the reference SVG uses
`PLAN_FONT_FAMILY` (system UI stack) so serialized files do not depend on
unresolved CSS variables.
