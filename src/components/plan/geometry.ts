/**
 * Minimal plan-drawing helpers.
 * Not a full geometry engine — wall miter fill, symbols, and hit-testing.
 */

export type Point = { x: number; y: number };

/**
 * Wall fill as separate rings so callers cannot flatten closed loops into one
 * subpath (which drops the wrap-around segment under even-odd / non-zero fill).
 *
 * Closed exterior: outer + inner rings → `M…Z M…Z` with fill-rule="evenodd".
 * Open interior: a single strip ring (butt-capped).
 */
export type WallRings = {
  closed: boolean;
  /** For closed walls: [outer, inner]. For open walls: [strip]. */
  rings: Point[][];
};

function sub(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

function mul(v: Point, s: number): Point {
  return { x: v.x * s, y: v.y * s };
}

function len(v: Point): number {
  return Math.hypot(v.x, v.y);
}

function norm(v: Point): Point {
  const l = len(v) || 1;
  return { x: v.x / l, y: v.y / l };
}

/** Left-hand perpendicular (screen / SVG y-down). */
export function perpLeft(v: Point): Point {
  return { x: -v.y, y: v.x };
}

function lineIntersect(
  p: Point,
  r: Point,
  q: Point,
  s: Point,
): Point | null {
  const rxs = r.x * s.y - r.y * s.x;
  if (Math.abs(rxs) < 1e-9) {
    return null;
  }
  const qmp = sub(q, p);
  const t = (qmp.x * s.y - qmp.y * s.x) / rxs;
  return add(p, mul(r, t));
}

/**
 * Mitered offset of one vertex: intersection of the two edge offset lines.
 * Caps extreme miters so acute corners do not explode.
 */
function offsetVertex(
  prev: Point,
  curr: Point,
  next: Point,
  distance: number,
  miterLimit = 4,
): Point {
  const dirIn = norm(sub(curr, prev));
  const dirOut = norm(sub(next, curr));
  const nIn = perpLeft(dirIn);
  const nOut = perpLeft(dirOut);
  const a = add(curr, mul(nIn, distance));
  const b = add(curr, mul(nOut, distance));
  const hit = lineIntersect(a, dirIn, b, dirOut);
  if (!hit) {
    return add(curr, mul(norm(add(nIn, nOut)), distance));
  }
  if (len(sub(hit, curr)) > Math.abs(distance) * miterLimit) {
    return add(curr, mul(norm(add(nIn, nOut)), distance));
  }
  return hit;
}

function offsetChain(
  points: Point[],
  distance: number,
  closed: boolean,
): Point[] {
  const n = points.length;
  if (n < 2) {
    return [];
  }

  const out: Point[] = [];

  for (let i = 0; i < n; i += 1) {
    if (!closed && (i === 0 || i === n - 1)) {
      const a = points[i === 0 ? 0 : n - 2];
      const b = points[i === 0 ? 1 : n - 1];
      const edge = norm(sub(b, a));
      out.push(add(points[i], mul(perpLeft(edge), distance)));
      continue;
    }

    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];
    out.push(offsetVertex(prev, curr, next, distance));
  }

  return out;
}

/**
 * Build wall fill rings from a centerline.
 * Closed: outer + inner as separate rings (serialize with evenodd).
 * Open: one butt-capped strip ring.
 */
export function wallPolygonFromCenterline(
  centerline: Point[],
  thickness: number,
  closed: boolean,
): WallRings {
  const half = thickness / 2;
  // For clockwise shells in SVG y-down, +half (left) faces interior, -half exterior.
  const left = offsetChain(centerline, half, closed);
  const right = offsetChain(centerline, -half, closed);

  if (closed) {
    // Outer face first, then inner hole — evenodd fills the wall band only.
    return {
      closed: true,
      rings: [right, left],
    };
  }

  return {
    closed: false,
    rings: [[...left, ...right.reverse()]],
  };
}

export function pointsToPath(points: Point[], closed = true): string {
  if (points.length === 0) {
    return "";
  }
  const [first, ...rest] = points;
  let d = `M ${first.x} ${first.y}`;
  for (const p of rest) {
    d += ` L ${p.x} ${p.y}`;
  }
  if (closed) {
    d += " Z";
  }
  return d;
}

/** Serialize one or more closed rings as separate SVG subpaths. */
export function ringsToPath(rings: Point[][]): string {
  return rings
    .filter((ring) => ring.length > 0)
    .map((ring) => pointsToPath(ring, true))
    .join(" ");
}

/**
 * Even-odd point-in-polygon for multi-ring paths (wall fills).
 * Counts crossings across every edge of every ring.
 */
export function pointInPolygon(point: Point, rings: Point[][]): boolean {
  let inside = false;
  for (const ring of rings) {
    if (ring.length < 3) {
      continue;
    }
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const pi = ring[i];
      const pj = ring[j];
      const intersect =
        pi.y > point.y !== pj.y > point.y &&
        point.x <
          ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y + Number.EPSILON) +
            pi.x;
      if (intersect) {
        inside = !inside;
      }
    }
  }
  return inside;
}

/** Polygon area in square inches (shoelace); absolute value. */
export function polygonAreaSqIn(points: Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export function sqInToSqFt(sqIn: number): number {
  return sqIn / 144;
}

export function formatFeetInches(inches: number): string {
  const whole = Math.round(inches);
  const feet = Math.floor(whole / 12);
  const rem = whole % 12;
  return `${feet}' ${rem}"`;
}

/** Axis-aligned bounding box size as "W × D" in feet-inches. */
export function formatRoomDimensions(points: Point[]): string {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return `${formatFeetInches(maxX - minX)} × ${formatFeetInches(maxY - minY)}`;
}

export function polygonCentroid(points: Point[]): Point {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  const n = points.length || 1;
  return { x: x / n, y: y / n };
}

export function polylineLength(points: Point[], closed = false): number {
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    total += len(sub(points[i + 1], points[i]));
  }
  if (closed && points.length > 1) {
    total += len(sub(points[0], points[points.length - 1]));
  }
  return total;
}

/** Point at distance `distance` along a (optionally closed) polyline. */
export function pointAtLength(
  points: Point[],
  distance: number,
  closed = false,
): Point {
  if (points.length === 0) {
    return { x: 0, y: 0 };
  }
  if (points.length === 1) {
    return points[0];
  }

  const segments: Array<{ a: Point; b: Point; len: number }> = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    segments.push({ a, b, len: len(sub(b, a)) });
  }
  if (closed) {
    const a = points[points.length - 1];
    const b = points[0];
    segments.push({ a, b, len: len(sub(b, a)) });
  }

  let remaining = Math.max(0, distance);
  for (const seg of segments) {
    if (remaining <= seg.len || seg === segments[segments.length - 1]) {
      const t = seg.len === 0 ? 0 : Math.min(1, remaining / seg.len);
      return add(seg.a, mul(sub(seg.b, seg.a), t));
    }
    remaining -= seg.len;
  }
  return points[points.length - 1];
}

/** Unit direction of the wall at a given distance along its centerline. */
export function directionAtLength(
  points: Point[],
  distance: number,
  closed = false,
): Point {
  const epsilon = 0.01;
  const a = pointAtLength(points, distance, closed);
  const b = pointAtLength(points, distance + epsilon, closed);
  return norm(sub(b, a));
}

/**
 * Opening endpoints on a wall centerline from offset + width.
 * `start` is at offset; `end` is at offset+width along the wall.
 */
export function openingEndpoints(
  centerline: Point[],
  offset: number,
  width: number,
  closed = false,
): { start: Point; end: Point } {
  return {
    start: pointAtLength(centerline, offset, closed),
    end: pointAtLength(centerline, offset + width, closed),
  };
}

export function doorHingeAndLatch(
  centerline: Point[],
  offset: number,
  width: number,
  hingeSide: "start" | "end",
  closed = false,
): { hinge: Point; latch: Point } {
  const { start, end } = openingEndpoints(centerline, offset, width, closed);
  if (hingeSide === "start") {
    return { hinge: start, latch: end };
  }
  return { hinge: end, latch: start };
}

/**
 * Door swing: quarter-circle from the closed leaf (along the wall toward latch)
 * into the room on swingSide of the wall direction.
 */
export function doorSwingPaths(
  hinge: Point,
  latch: Point,
  swingSide: 1 | -1,
): { leaf: string; arc: string; radius: number } {
  const along = sub(latch, hinge);
  const radius = len(along);
  const dir = norm(along);
  const intoRoom = mul(perpLeft(dir), swingSide);
  const openEnd = add(hinge, mul(intoRoom, radius));

  const sweep = swingSide === 1 ? 1 : 0;
  const arc = `M ${latch.x} ${latch.y} A ${radius} ${radius} 0 0 ${sweep} ${openEnd.x} ${openEnd.y}`;
  const leaf = `M ${hinge.x} ${hinge.y} L ${openEnd.x} ${openEnd.y}`;

  return { leaf, arc, radius };
}

/** Two parallel lines inset into a wall opening (classic window symbol). */
export function windowPaneLines(
  a: Point,
  b: Point,
  wallThickness: number,
  insetRatio: number,
): [Point, Point, Point, Point] {
  const dir = norm(sub(b, a));
  const n = perpLeft(dir);
  const inset = (wallThickness / 2) * (1 - insetRatio * 2);
  const o1 = mul(n, inset);
  const o2 = mul(n, -inset);
  return [add(a, o1), add(b, o1), add(a, o2), add(b, o2)];
}

/** Distance from point to closest point on segment; used by assertions. */
export function distancePointToSegment(
  point: Point,
  a: Point,
  b: Point,
): number {
  const ab = sub(b, a);
  const abLenSq = ab.x * ab.x + ab.y * ab.y;
  if (abLenSq < 1e-12) {
    return len(sub(point, a));
  }
  const t = Math.max(
    0,
    Math.min(1, ((point.x - a.x) * ab.x + (point.y - a.y) * ab.y) / abLenSq),
  );
  const proj = add(a, mul(ab, t));
  return len(sub(point, proj));
}

export function centerlineSegments(
  centerline: Point[],
  closed: boolean,
): Array<{ a: Point; b: Point }> {
  const segs: Array<{ a: Point; b: Point }> = [];
  for (let i = 0; i < centerline.length - 1; i += 1) {
    segs.push({ a: centerline[i], b: centerline[i + 1] });
  }
  if (closed && centerline.length > 1) {
    segs.push({
      a: centerline[centerline.length - 1],
      b: centerline[0],
    });
  }
  return segs;
}

export function segmentMidpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Long-axis angle in degrees for plank texture (from axis-aligned bounds). */
export function roomLongAxisDegrees(points: Point[]): number {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return maxX - minX >= maxY - minY ? 0 : 90;
}

export function isFinitePoint(p: Point): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y);
}
