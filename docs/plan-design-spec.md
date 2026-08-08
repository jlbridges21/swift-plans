# Plan design specification

Visual target for Swift Plans exports and editor rendering. The reference
renderings live at `/debug/plan-style`. Tokens live in
`src/lib/plan-style/tokens.ts`.

## Variants

### 1. Minimal editorial

Near-white ground, almost no fill contrast, walls as solid charcoal poché,
typography doing the hierarchical work. Reads like a layout document in an
editorial real-estate magazine.

**Strengths:** calm, scales well in dense MLS grids, easiest to brand later by
adding a logo without fighting color.
**Weaknesses:** can feel cold or unfinished if labels are weak; little
differentiation between room types at a glance.

### 2. Warm architectural

Warm off-white paper, tonal room fills, slightly heavier visual weight, soft
footprint shadow. Closest to a classic high-end realtor presentation plan.

**Strengths:** immediately “professional floor plan”; shadow lifts the
footprint off the sheet; tonal fills guide the eye without rainbow kitsch.
**Weaknesses:** shadow is a presentation effect (easy in SVG, must be optional
in export settings); slightly more ink on the page.

### 3. Textured (recommended)

Same warm paper and tonal fills as the architectural direction, plus
category-aware floor hatching at very low opacity: plank lines in living
space, a light tile grid in wet rooms, angled service hatch in garage/closet.

**Strengths:** most distinctly *designed*; hatch communicates room type before
you read the label; still monochrome and MLS-safe; survives reduction to phone
width better than color coding.
**Weaknesses:** hatch must be clipped to room polygons and stay ≤ ~5% opacity
or it turns noisy; more draw calls; hatch patterns must export cleanly into
standalone SVG.

### Recommendation

**Ship Textured as the default presentation style**, with Minimal and Warm
available as presentation presets later (Phase 7). Textured is the only
direction that feels ownable without introducing chromatic room colors (which
age poorly and fight photography-adjacent branding). Warm is the fallback if
hatch proves costly on mobile; Minimal is the unbranded/MLS-safe extreme.

---

## Token list (intent)

| Token | Intent |
| --- | --- |
| `paper` | Document ground — warm off-white; never pure white; independent of app theme |
| `ink` | Primary structure fill/stroke — soft charcoal; never `#000` |
| `inkMuted` | Room labels |
| `inkSubtle` | Dimensions and secondary annotations |
| `stroke.emphasis` | Rare heavy annotation (north arrow, etc.) |
| `stroke.fixture` | Door leaf, window panes, stair treads |
| `stroke.annotation` | Dimension ticks, hatch lines |
| `wallExterior` / `wallInterior` | Filled wall thicknesses in drawing inches |
| `fill.living` / `wet` / `service` | Tonal room fills by category |
| `hatchOpacity` | Cap for textured hatch so it stays atmospheric |
| `footprintShadow` | Warm-variant lift only |
| `typography.*` | Label / dimension / area sizes and tracking |
| `sheetMargin` | Breathing room around the footprint in the viewBox |
| `doorSwing.stroke` / `window.*` | Symbol line weights and window inset ratio |

**Drawing space:** 1 SVG user unit = **1 inch**. Stored measurements are inches;
the drawing space uses the same numeric unit 1:1. Feet/inches strings are
display formatting only.

**Plan colors never follow `prefers-color-scheme` or `--sp-*` app tokens.**

Room type → category mapping is in `ROOM_TYPE_CATEGORY` inside the tokens file
(living / wet / service).

---

## Geometry requirements

This section is the contract for Phase 2 schema design. Everything below must
exist in structured data for the reference look to be reproducible from real
plans.

### Walls

For each wall segment (or continuous wall run):

- **Centerline polyline** — ordered vertices in inches (`{x,y}[]`)
- **Thickness** — inches (or a kind that maps to exterior/interior defaults)
- **`kind`: `exterior` | `interior`** — drives thickness and visual weight
- **Open vs closed** — exterior shell is typically one closed loop; interior
  partitions are open runs that terminate on other walls
- **Shared-wall / T-junction identity** (later) — which walls meet at which
  vertex, so joins can be resolved without double-poché or gaps

Rendering consumes a **mitered filled polygon** derived from centerline +
thickness. Stroked centerlines are not acceptable for presentation.

### Rooms

- **Polygon** — ordered interior-face vertices (the floor area), not a
  width×height rectangle type
- **Category** (or room `type` mappable to living/wet/service)
- **Label string**
- **Label anchor** `{x,y}` — optional override; default centroid is often wrong
  for L-shapes and should be authorable
- **Display dimensions** — either stored or derived from polygon bounds /
  measuring edges; format `12' 6" × 10' 0"`
- **Area** — derived from polygon (shoelace) in sq in → sq ft; do not store as
  the only source of truth if the polygon can change

### Doors

- **Host wall id** (or geometric attachment to a wall segment)
- **Offset along wall** and **opening width** (inches), *or* explicit hinge +
  latch points
- **Hinge side** — which end of the opening is the hinge
- **Swing direction / swing side** — which side of the wall the leaf arcs into
  (into which room). Required for a correct quarter-circle arc + leaf line
- **`exterior` flag** — entry doors vs interior doors (opening cut width /
  symbol weight)

### Windows

- **Host wall id**
- **Offset along wall** and **width**
- **Wall thickness context** — so parallel pane lines inset correctly into the
  wall body

### Sheet / presentation

- Bounding box of geometry
- Sheet margin
- Optional presentation preset (`minimal` | `warm` | `textured`)
- Total living area = sum of room areas excluding garage (product rule to
  confirm), placed as a typographic element — not a random corner stamp

### Units

- All geometry in **inches**
- Drawing space inches == stored inches (1:1)
- Formatting to feet/inches only at display/export text time

---

## Hand-faked / hard-later notes

Be honest about what the static reference cheats on:

1. **T-junctions and wall end caps** — Interior runs are butt-capped and simply
   overdraw where they meet the shell. A real solver must clip or miter wall
   ends into the host wall so poché doesn’t double up or leave hairline gaps.
   This is the hardest Phase 2/7 rendering problem.

2. **Door openings cutting walls** — The reference “cuts” an opening by
   painting a paper-colored stroke over the wall, then redrawing the swing.
   Production rendering should boolean-subtract the opening from the wall
   polygon (or break the wall into two runs) so exports don’t rely on
   paint-order tricks.

3. **Label anchors on L-shapes** — Centroids of concave polygons can fall
   outside the room or on a wall. The sample plan hand-places anchors. Schema
   needs an optional label point; auto-placement is a later heuristic.

4. **Dimension strings** — Sample uses axis-aligned bounding-box width×depth.
   Real rooms (especially L-shapes and angled walls) need either measured wall
   lengths or authored dimension annotations. BBB is a stopgap, not the product.

5. **Shared house/garage wall** — Drawn as an extra exterior-weight segment
   that meets the shell at a T. Automatic envelope extraction from a wall graph
   must mark fire/garage separations explicitly.

6. **SVG filters (`feDropShadow`)** — Used only in the warm variant. Fine for
   on-screen reference; export pipelines should treat shadow as an optional
   post-effect (or bake it) because some SVG→PDF/PNG paths handle filters
   inconsistently.

7. **Fonts in exported SVG** — Reference uses Geist via the app’s CSS variable.
   A standalone `.svg` emailed to a client will fall back unless we subset/embed
   the font or convert labels to paths (Phase 8). See font recommendation below.

8. **Hatch patterns** — Implemented as SVG `<pattern>`. Cheap here; must remain
   clipped to room polygons and stay very light. Changing room polygons must
   not require re-authoring hatch.

---

## Font recommendation (do not install in this phase)

**Recommendation: [IBM Plex Sans](https://github.com/IBM/plex)** for plan
labels (and a slightly tighter weight for dimensions).

**Why**

- Geometric enough to read as “architectural” at small sizes and wide tracking
- Excellent numerals for dimensions (`12' 6"`)
- SIL Open Font License — free to self-host, subset, and embed in exports
- Distinct from generic Inter/system UI faces without requiring a paid license
  for every exported file

**Licensing / self-hosting**

- OFL-1.1: embeddable in documents and SVG; keep license notice with the font
  files
- Self-host WOFF2 subsets (uppercase + figures + punctuation is enough for
  plans) to keep export payloads small

**Phase 8 consequence**

Exported SVG/PDF/PNG must either:

1. Embed a subset of the face, or
2. Convert label text to paths at export time

Otherwise recipients see fallback fonts and tracking/metrics shift. Geist is
acceptable for in-app reference only until that pipeline exists; do not assume
Geist’s license/distribution model covers every white-label export without
checking.

**Alternate:** keep Geist if Vercel’s license covers our export embedding needs
after legal review — but IBM Plex Sans is the safer default for a product whose
*output file* leaves our domain.
