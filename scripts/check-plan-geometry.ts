/**
 * Computable geometry assertions for the sample floor plan.
 * Run: npm run check:plan-geometry
 *   or: node --experimental-strip-types scripts/check-plan-geometry.ts
 *
 * Relative imports only — the @/ alias does not resolve under plain Node.
 */

import {
  centerlineSegments,
  doorHingeAndLatch,
  isFinitePoint,
  pointInPolygon,
  polygonAreaSqIn,
  polygonCentroid,
  segmentMidpoint,
  sqInToSqFt,
  wallPolygonFromCenterline,
  type Point,
} from "../src/components/plan/geometry.ts";
import { sampleFloorGeometry } from "../src/components/plan/sample-plan.ts";
import { planTokens } from "../src/lib/plan-style/tokens.ts";
import {
  createEmptyFloorGeometry,
  isEmptyFloorGeometry,
} from "../src/types/plan-geometry.ts";

let failed = 0;

function ok(label: string): void {
  console.log("ok ", label);
}

function fail(label: string, detail: string): void {
  failed += 1;
  console.log("FAIL", label, "—", detail);
}

function assert(condition: boolean, label: string, detail = ""): void {
  if (condition) {
    ok(label);
  } else {
    fail(label, detail || "assertion failed");
  }
}

const geometry = sampleFloorGeometry;

// ---------------------------------------------------------------------------
// 1 + 2. Wall coverage (including closed wrap-around segments)
// ---------------------------------------------------------------------------
for (const wall of geometry.walls) {
  const fill = wallPolygonFromCenterline(
    wall.centerline,
    wall.thickness,
    wall.closed,
  );
  const segs = centerlineSegments(wall.centerline, wall.closed);

  assert(
    wall.closed
      ? segs.length === wall.centerline.length
      : segs.length === Math.max(0, wall.centerline.length - 1),
    `wall ${wall.id} segment count`,
    wall.closed
      ? `closed wall should have N=${wall.centerline.length} segments (including wrap-around), got ${segs.length}`
      : `open wall should have N-1 segments, got ${segs.length}`,
  );

  segs.forEach((seg, index) => {
    const mid = segmentMidpoint(seg.a, seg.b);
    const dx = seg.b.x - seg.a.x;
    const dy = seg.b.y - seg.a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const halfOffset = wall.thickness / 4;
    const left: Point = {
      x: mid.x + nx * halfOffset,
      y: mid.y + ny * halfOffset,
    };
    const right: Point = {
      x: mid.x - nx * halfOffset,
      y: mid.y - ny * halfOffset,
    };

    const midInside = pointInPolygon(mid, fill.rings);
    assert(
      midInside,
      `wall ${wall.id} seg[${index}] midpoint inside fill`,
      midInside
        ? ""
        : `midpoint (${mid.x.toFixed(1)}, ${mid.y.toFixed(1)}) is OUTSIDE wall polygon — closed loops must cover the wrap-around segment`,
    );

    assert(
      pointInPolygon(left, fill.rings),
      `wall ${wall.id} seg[${index}] +thickness/4 inside`,
      `offset point outside fill`,
    );
    assert(
      pointInPolygon(right, fill.rings),
      `wall ${wall.id} seg[${index}] -thickness/4 inside`,
      `offset point outside fill`,
    );
  });
}

// Explicit west-wall wrap-around check (the bug that shipped in 1.5a).
{
  const shell = geometry.walls.find((w) => w.id === "ext-shell");
  if (!shell) {
    fail("ext-shell present", "missing exterior shell wall");
  } else {
    const fill = wallPolygonFromCenterline(
      shell.centerline,
      shell.thickness,
      shell.closed,
    );
    const westMid: Point = {
      x: shell.centerline[0].x,
      y: (shell.centerline[0].y + shell.centerline[shell.centerline.length - 1].y) / 2,
    };
    assert(
      pointInPolygon(westMid, fill.rings),
      "west exterior wall midpoint inside shell fill",
      `point (${westMid.x}, ${westMid.y}) outside — single-subpath closed fills drop the wrap-around segment`,
    );
  }
}

// ---------------------------------------------------------------------------
// 3. Room centroids are not inside any wall
// ---------------------------------------------------------------------------
for (const room of geometry.rooms) {
  const centroid = room.labelAnchor ?? polygonCentroid(room.polygon);
  let insideWall = false;
  let hostWall = "";
  for (const wall of geometry.walls) {
    const fill = wallPolygonFromCenterline(
      wall.centerline,
      wall.thickness,
      wall.closed,
    );
    if (pointInPolygon(centroid, fill.rings)) {
      insideWall = true;
      hostWall = wall.id;
      break;
    }
  }
  assert(
    !insideWall,
    `room ${room.id} centroid not in wall`,
    insideWall ? `centroid lies inside wall ${hostWall}` : "",
  );
}

// ---------------------------------------------------------------------------
// 4. Numeric sanity
// ---------------------------------------------------------------------------
{
  let bad = 0;
  for (const wall of geometry.walls) {
    const fill = wallPolygonFromCenterline(
      wall.centerline,
      wall.thickness,
      wall.closed,
    );
    for (const ring of fill.rings) {
      for (const p of ring) {
        if (!isFinitePoint(p)) {
          bad += 1;
        }
      }
    }
    for (const p of wall.centerline) {
      if (!isFinitePoint(p)) {
        bad += 1;
      }
    }
  }
  for (const room of geometry.rooms) {
    for (const p of room.polygon) {
      if (!isFinitePoint(p)) {
        bad += 1;
      }
    }
  }
  assert(bad === 0, "no NaN/Infinity coordinates in walls/rooms", `found ${bad}`);
}

// ---------------------------------------------------------------------------
// 5. Door geometry
// ---------------------------------------------------------------------------
for (const door of geometry.doors) {
  const wall = geometry.walls.find((w) => w.id === door.wallId);
  if (!wall) {
    fail(`door ${door.id} wall exists`, `unknown wall ${door.wallId}`);
    continue;
  }
  const { hinge, latch } = doorHingeAndLatch(
    wall.centerline,
    door.offset,
    door.width,
    door.hingeSide,
    wall.closed,
  );
  const radius = Math.hypot(latch.x - hinge.x, latch.y - hinge.y);
  assert(
    Math.abs(radius - door.width) < 0.5,
    `door ${door.id} radius equals width`,
    `radius ${radius.toFixed(2)} vs width ${door.width.toFixed(2)}`,
  );

  // Latch (arc start when hingeSide=start) should lie on the wall centerline.
  const segs = centerlineSegments(wall.centerline, wall.closed);
  let minDist = Infinity;
  for (const seg of segs) {
    const abx = seg.b.x - seg.a.x;
    const aby = seg.b.y - seg.a.y;
    const abLenSq = abx * abx + aby * aby;
    let t = 0;
    if (abLenSq > 1e-12) {
      t = Math.max(
        0,
        Math.min(
          1,
          ((latch.x - seg.a.x) * abx + (latch.y - seg.a.y) * aby) / abLenSq,
        ),
      );
    }
    const px = seg.a.x + abx * t;
    const py = seg.a.y + aby * t;
    minDist = Math.min(minDist, Math.hypot(latch.x - px, latch.y - py));
  }
  assert(
    minDist < 1,
    `door ${door.id} latch on wall centerline`,
    `distance ${minDist.toFixed(3)} exceeds tolerance`,
  );
}

// ---------------------------------------------------------------------------
// 6. Area sanity
// ---------------------------------------------------------------------------
{
  let total = 0;
  for (const room of geometry.rooms) {
    const area = sqInToSqFt(polygonAreaSqIn(room.polygon));
    assert(area > 0, `room ${room.id} area > 0`, `area=${area}`);
    if (room.type !== "garage") {
      total += area;
    }
  }
  assert(
    Math.abs(total - 1450) <= 50,
    "total living area ≈ 1450 sq ft",
    `got ${total.toFixed(1)}`,
  );
}

// ---------------------------------------------------------------------------
// 7. Empty geometry document — valid finite viewBox (new projects)
// ---------------------------------------------------------------------------
{
  const empty = createEmptyFloorGeometry("Untitled");
  assert(isEmptyFloorGeometry(empty), "createEmptyFloorGeometry is empty");
  assert(empty.schemaVersion === 1, "empty schemaVersion is 1");
  assert(empty.walls.length === 0, "empty walls array");
  assert(empty.rooms.length === 0, "empty rooms array");

  const margin = planTokens.sheetMargin;
  const viewMinX = empty.meta.bounds.minX - margin;
  const viewMinY = empty.meta.bounds.minY - margin;
  const viewW =
    empty.meta.bounds.maxX - empty.meta.bounds.minX + margin * 2;
  const viewH =
    empty.meta.bounds.maxY - empty.meta.bounds.minY + margin * 2;

  assert(
    [viewMinX, viewMinY, viewW, viewH].every(
      (n) => Number.isFinite(n) && !Number.isNaN(n),
    ),
    "empty geometry viewBox values are finite",
    `viewBox=${viewMinX} ${viewMinY} ${viewW} ${viewH}`,
  );
  assert(viewW > 0 && viewH > 0, "empty geometry viewBox has positive size");
}

console.log("");
console.log(
  failed === 0
    ? `All geometry assertions passed (${geometry.walls.length} walls, ${geometry.rooms.length} rooms).`
    : `${failed} geometry assertion(s) failed.`,
);
process.exit(failed === 0 ? 0 : 1);
