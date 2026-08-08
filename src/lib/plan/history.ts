/**
 * In-memory undo/redo stack over FloorGeometry snapshots.
 * Pure functions — no React. Pan/zoom never enter this stack.
 */

import type { FloorGeometry } from "../../types/plan-geometry.ts";

/** Max discrete actions retained (oldest dropped). */
export const MAX_GEOMETRY_HISTORY = 50;

export type GeometryHistory = {
  past: FloorGeometry[];
  present: FloorGeometry;
  future: FloorGeometry[];
};

export function geometryDeepEqual(a: FloorGeometry, b: FloorGeometry): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function createGeometryHistory(
  present: FloorGeometry,
): GeometryHistory {
  return { past: [], present, future: [] };
}

/** Record a discrete user action that produced `next`. */
export function historyPush(
  history: GeometryHistory,
  next: FloorGeometry,
): GeometryHistory {
  if (geometryDeepEqual(history.present, next)) {
    return history;
  }
  const past = [...history.past, history.present];
  if (past.length > MAX_GEOMETRY_HISTORY) {
    past.splice(0, past.length - MAX_GEOMETRY_HISTORY);
  }
  return { past, present: next, future: [] };
}

/** Mid-gesture document update — does not push history. */
export function historyReplacePresent(
  history: GeometryHistory,
  next: FloorGeometry,
): GeometryHistory {
  if (geometryDeepEqual(history.present, next)) {
    return history;
  }
  return { ...history, present: next };
}

/**
 * End of a drag/resize gesture: if `present` differs from `baseline`
 * (document at gesture start), push baseline as one undo step.
 */
export function historyCommitGesture(
  history: GeometryHistory,
  baseline: FloorGeometry,
): GeometryHistory {
  if (geometryDeepEqual(history.present, baseline)) {
    return history;
  }
  const past = [...history.past, baseline];
  if (past.length > MAX_GEOMETRY_HISTORY) {
    past.splice(0, past.length - MAX_GEOMETRY_HISTORY);
  }
  return { past, present: history.present, future: [] };
}

export function historyUndo(history: GeometryHistory): GeometryHistory {
  if (history.past.length === 0) return history;
  const past = history.past.slice();
  const previous = past.pop()!;
  return {
    past,
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function historyRedo(history: GeometryHistory): GeometryHistory {
  if (history.future.length === 0) return history;
  const [next, ...future] = history.future;
  return {
    past: [...history.past, history.present],
    present: next!,
    future,
  };
}

export function canUndo(history: GeometryHistory): boolean {
  return history.past.length > 0;
}

export function canRedo(history: GeometryHistory): boolean {
  return history.future.length > 0;
}
