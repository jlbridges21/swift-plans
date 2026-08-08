/**
 * Minimal plan-drawing helpers for the static reference renders.
 * Not a geometry engine — just enough to miter wall fills and draw symbols.
 */

export type Point = { x: number; y: number };

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
function perpLeft(v: Point): Point {
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
 * Build a filled wall polygon from a centerline.
 * For closed loops: left strip + reversed right strip (even winding).
 * For open runs: butt-capped strip with mitered intermediate corners.
 */
export function wallPolygonFromCenterline(
  centerline: Point[],
  thickness: number,
  closed: boolean,
): Point[] {
  const half = thickness / 2;
  const left = offsetChain(centerline, half, closed);
  const right = offsetChain(centerline, -half, closed);
  return [...left, ...right.reverse()];
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

  // SVG arc: from latch (closed) to openEnd.
  // sweep-flag depends on swingSide and SVG y-down coordinates.
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
