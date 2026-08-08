"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { PlanDocument, planViewBox } from "@/components/plan/PlanDrawing";
import { pointsToPath } from "@/components/plan/geometry";
import { planTokens } from "@/lib/plan-style/tokens";
import {
  ROOM_SNAP_THRESHOLD_PX,
  snapRoomTranslation,
  snapStairsTranslation,
  type SnapGuide,
} from "@/lib/plan/snap";
import { listOpenings, openingWorldSpan } from "@/lib/plan/openings";
import { stairsPolygon } from "@/lib/plan/stairs";
import {
  hitTest,
  type HitSelectionState,
  type HitTarget,
} from "@/lib/plan/hit-test";
import {
  DEFAULT_PLAN_STYLE,
  type PlanStyleSettings,
} from "@/lib/plan/style-settings";
import type { FloorGeometry, PlanPoint } from "@/types/plan-geometry";
import {
  collectSnapTargets,
  snapOrthoPoint,
} from "@/lib/plan/polygon-edit";

export type CameraViewBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type CanvasContextRequest = {
  clientX: number;
  clientY: number;
  hit: HitTarget;
};

type EditorCanvasProps = {
  geometry: FloorGeometry;
  style?: PlanStyleSettings;
  selectedRoomId: string | null;
  selectedWallId: string | null;
  selectedOpeningId: string | null;
  selectedStairsId: string | null;
  selectedVertexIndex: number | null;
  labelSelected: boolean;
  reshape: boolean;
  /** When true, drags on the selected room always translate the room. */
  moveLocked: boolean;
  onSelectRoom: (roomId: string | null) => void;
  onSelectWall: (wallId: string | null) => void;
  onSelectOpening: (openingId: string | null) => void;
  onSelectStairs: (stairsId: string | null) => void;
  onSelectVertex: (roomId: string, vertexIndex: number) => void;
  onSelectLabel: (roomId: string | null) => void;
  onClearSelection: () => void;
  onMoveRoom: (roomId: string, dx: number, dy: number) => void;
  onMoveOpening: (openingId: string, offsetIn: number) => void;
  onMoveStairs: (stairsId: string, dx: number, dy: number) => void;
  onMoveLabel: (roomId: string, at: PlanPoint) => void;
  onMoveVertex: (
    roomId: string,
    vertexIndex: number,
    x: number,
    y: number,
  ) => void;
  onInsertVertex: (roomId: string, edgeIndex: number, offsetIn: number) => void;
  onDocumentGestureStart: () => void;
  onDocumentGestureEnd: () => void;
  onInteractionChange: (active: boolean) => void;
  onContextMenuRequest: (req: CanvasContextRequest) => void;
  onZoomToFitRef?: React.MutableRefObject<(() => void) | null>;
  onSelectionAnchorRef?: React.MutableRefObject<
    (() => { x: number; y: number } | null) | null
  >;
};

const MIN_VIEW_IN = 24;
const MAX_VIEW_IN = 12000;
const FIT_PADDING = 1.12;
const LONG_PRESS_MS = 500;
const DRAG_THRESHOLD_PX = 10;

function clampView(view: CameraViewBox): CameraViewBox {
  const w = Math.min(MAX_VIEW_IN, Math.max(MIN_VIEW_IN, view.w));
  const h = Math.min(MAX_VIEW_IN, Math.max(MIN_VIEW_IN, view.h));
  return { x: view.x, y: view.y, w, h };
}

function fitView(
  geometry: FloorGeometry,
  viewportW: number,
  viewportH: number,
): CameraViewBox {
  const content = planViewBox(geometry);
  if (viewportW <= 0 || viewportH <= 0) {
    return {
      x: content.minX,
      y: content.minY,
      w: content.width,
      h: content.height,
    };
  }
  const contentAspect = content.width / content.height;
  const viewAspect = viewportW / viewportH;
  let w: number;
  let h: number;
  if (contentAspect > viewAspect) {
    w = content.width * FIT_PADDING;
    h = w / viewAspect;
  } else {
    h = content.height * FIT_PADDING;
    w = h / viewAspect;
  }
  return clampView({
    x: content.minX + content.width / 2 - w / 2,
    y: content.minY + content.height / 2 - h / 2,
    w,
    h,
  });
}

type ActiveGesture =
  | {
      kind: "pan";
      pointerId: number;
      lastClientX: number;
      lastClientY: number;
    }
  | {
      kind: "pending";
      pointerId: number;
      hit: HitTarget;
      startClientX: number;
      startClientY: number;
      lastClientX: number;
      lastClientY: number;
      longPressTimer: ReturnType<typeof setTimeout> | null;
      suppressedContext: boolean;
    }
  | {
      kind: "move-room";
      pointerId: number;
      roomId: string;
      lastClientX: number;
      lastClientY: number;
      lastWorldX: number;
      lastWorldY: number;
    }
  | {
      kind: "move-opening";
      pointerId: number;
      openingId: string;
      lastClientX: number;
      lastClientY: number;
    }
  | {
      kind: "move-stairs";
      pointerId: number;
      stairsId: string;
      lastClientX: number;
      lastClientY: number;
      lastWorldX: number;
      lastWorldY: number;
    }
  | {
      kind: "move-label";
      pointerId: number;
      roomId: string;
      lastClientX: number;
      lastClientY: number;
    }
  | {
      kind: "move-vertex";
      pointerId: number;
      roomId: string;
      vertexIndex: number;
      lastClientX: number;
      lastClientY: number;
    }
  | {
      kind: "pinch";
      pointers: Map<number, { x: number; y: number }>;
      lastDist: number;
      lastMidX: number;
      lastMidY: number;
    };

function pixelsPerInch(
  svg: SVGSVGElement | null,
  view: CameraViewBox,
): number {
  if (!svg) return 1;
  const rect = svg.getBoundingClientRect();
  if (rect.width <= 0 || view.w <= 0) return 1;
  return rect.width / view.w;
}

/**
 * Interactive plan canvas: PlanDocument + selection overlay.
 * Hit testing is pure (hitTest) — not DOM z-order.
 */
export function EditorCanvas({
  geometry,
  style = DEFAULT_PLAN_STYLE,
  selectedRoomId,
  selectedWallId,
  selectedOpeningId,
  selectedStairsId,
  selectedVertexIndex,
  labelSelected,
  reshape,
  moveLocked,
  onSelectRoom,
  onSelectWall,
  onSelectOpening,
  onSelectStairs,
  onSelectVertex,
  onSelectLabel,
  onClearSelection,
  onMoveRoom,
  onMoveOpening,
  onMoveStairs,
  onMoveLabel,
  onMoveVertex,
  onInsertVertex,
  onDocumentGestureStart,
  onDocumentGestureEnd,
  onInteractionChange,
  onContextMenuRequest,
  onZoomToFitRef,
  onSelectionAnchorRef,
}: EditorCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const geometryRef = useRef(geometry);
  const selectionRef = useRef({
    selectedRoomId,
    selectedWallId,
    selectedOpeningId,
    selectedStairsId,
    labelSelected,
    reshape,
    moveLocked,
  });
  const [view, setView] = useState<CameraViewBox>(() =>
    fitView(geometry, 390, 520),
  );
  const viewRef = useRef(view);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const gestureRef = useRef<ActiveGesture | null>(null);
  const didInitialFit = useRef(false);
  const prevRoomCount = useRef(geometry.rooms.length);
  const contextCbRef = useRef(onContextMenuRequest);
  useEffect(() => {
    contextCbRef.current = onContextMenuRequest;
  }, [onContextMenuRequest]);

  useEffect(() => {
    geometryRef.current = geometry;
  }, [geometry]);

  useEffect(() => {
    selectionRef.current = {
      selectedRoomId,
      selectedWallId,
      selectedOpeningId,
      selectedStairsId,
      labelSelected,
      reshape,
      moveLocked,
    };
  }, [
    selectedRoomId,
    selectedWallId,
    selectedOpeningId,
    selectedStairsId,
    labelSelected,
    reshape,
    moveLocked,
  ]);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const clientToWorld = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const v = viewRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    return {
      x: v.x + ((clientX - rect.left) / rect.width) * v.w,
      y: v.y + ((clientY - rect.top) / rect.height) * v.h,
    };
  }, []);

  const worldToClient = useCallback((world: PlanPoint) => {
    const svg = svgRef.current;
    const v = viewRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: rect.left + ((world.x - v.x) / v.w) * rect.width,
      y: rect.top + ((world.y - v.y) / v.h) * rect.height,
    };
  }, []);

  const applyFit = useCallback(() => {
    const svg = svgRef.current;
    const rect = svg?.getBoundingClientRect();
    setView(
      fitView(
        geometryRef.current,
        rect?.width ?? 390,
        rect?.height ?? 520,
      ),
    );
  }, []);

  useEffect(() => {
    if (onZoomToFitRef) onZoomToFitRef.current = applyFit;
  }, [applyFit, onZoomToFitRef]);

  useEffect(() => {
    if (!onSelectionAnchorRef) return;
    onSelectionAnchorRef.current = () => {
      const g = geometryRef.current;
      const s = selectionRef.current;
      if (s.selectedStairsId) {
        const stair = g.stairs.find((st) => st.id === s.selectedStairsId);
        if (!stair) return null;
        const poly = stairsPolygon(stair);
        const cx = poly.reduce((a, p) => a + p.x, 0) / poly.length;
        const cy = poly.reduce((a, p) => a + p.y, 0) / poly.length;
        return worldToClient({ x: cx, y: cy });
      }
      if (s.selectedOpeningId) {
        const op = listOpenings(g).find((o) => o.id === s.selectedOpeningId);
        if (!op) return null;
        const span = openingWorldSpan(g.rooms, op);
        if (!span) return null;
        return worldToClient({
          x: (span.start.x + span.end.x) / 2,
          y: (span.start.y + span.end.y) / 2,
        });
      }
      if (s.selectedWallId) {
        const wall = g.walls.find((w) => w.id === s.selectedWallId);
        if (!wall || wall.centerline.length < 2) return null;
        const mid = wall.centerline[Math.floor(wall.centerline.length / 2)]!;
        return worldToClient(mid);
      }
      if (s.selectedRoomId) {
        const room = g.rooms.find((r) => r.id === s.selectedRoomId);
        if (!room) return null;
        return worldToClient(room.labelAnchor);
      }
      return null;
    };
  }, [onSelectionAnchorRef, worldToClient]);

  useEffect(() => {
    if (didInitialFit.current) return;
    didInitialFit.current = true;
    applyFit();
    const id = requestAnimationFrame(() => applyFit());
    return () => cancelAnimationFrame(id);
  }, [applyFit]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const delta =
        Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      const rect = svg.getBoundingClientRect();
      const v = viewRef.current;
      const wx = v.x + ((e.clientX - rect.left) / rect.width) * v.w;
      const wy = v.y + ((e.clientY - rect.top) / rect.height) * v.h;
      const factor = Math.exp(delta * 0.0015);
      const next = clampView({
        x: v.x,
        y: v.y,
        w: v.w * factor,
        h: v.h * factor,
      });
      setView({
        ...next,
        x: wx - ((e.clientX - rect.left) / rect.width) * next.w,
        y: wy - ((e.clientY - rect.top) / rect.height) * next.h,
      });
    };
    svg.addEventListener("wheel", handler, { passive: false });
    return () => svg.removeEventListener("wheel", handler);
  }, []);

  useEffect(() => {
    const count = geometry.rooms.length;
    if (prevRoomCount.current !== count) {
      prevRoomCount.current = count;
      if (didInitialFit.current) applyFit();
    }
  }, [geometry.rooms.length, applyFit]);

  function zoomAt(clientX: number, clientY: number, factor: number) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const v = viewRef.current;
    const wx = v.x + ((clientX - rect.left) / rect.width) * v.w;
    const wy = v.y + ((clientY - rect.top) / rect.height) * v.h;
    const next = clampView({
      x: v.x,
      y: v.y,
      w: v.w * factor,
      h: v.h * factor,
    });
    setView({
      ...next,
      x: wx - ((clientX - rect.left) / rect.width) * next.w,
      y: wy - ((clientY - rect.top) / rect.height) * next.h,
    });
  }

  function beginPinch(
    aId: number,
    a: { x: number; y: number },
    bId: number,
    b: { x: number; y: number },
  ) {
    const pointers = new Map<number, { x: number; y: number }>();
    pointers.set(aId, a);
    pointers.set(bId, b);
    const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    gestureRef.current = {
      kind: "pinch",
      pointers,
      lastDist: dist,
      lastMidX: (a.x + b.x) / 2,
      lastMidY: (a.y + b.y) / 2,
    };
    onInteractionChange(true);
  }

  function clearLongPress(g: ActiveGesture | null) {
    if (g && g.kind === "pending" && g.longPressTimer) {
      clearTimeout(g.longPressTimer);
      g.longPressTimer = null;
    }
  }

  function selectionState(): HitSelectionState {
    const s = selectionRef.current;
    return {
      selectedRoomId: s.selectedRoomId,
      selectedWallId: s.selectedWallId,
      selectedOpeningId: s.selectedOpeningId,
      selectedStairsId: s.selectedStairsId,
      labelSelected: s.labelSelected,
      reshape: s.reshape,
    };
  }

  function resolveHit(clientX: number, clientY: number): HitTarget {
    const world = clientToWorld(clientX, clientY);
    const ppi = pixelsPerInch(svgRef.current, viewRef.current);
    return hitTest(geometryRef.current, world, selectionState(), ppi);
  }

  function applyTapSelection(hit: HitTarget) {
    switch (hit.kind) {
      case "pan":
        onClearSelection();
        break;
      case "room":
        onSelectRoom(hit.roomId);
        break;
      case "wall":
        onSelectWall(hit.wallId);
        break;
      case "opening":
        onSelectOpening(hit.openingId);
        break;
      case "stairs":
        onSelectStairs(hit.stairsId);
        break;
      case "label":
        onSelectLabel(hit.roomId);
        break;
      case "vertex":
        onSelectVertex(hit.roomId, hit.vertexIndex);
        break;
      case "edge-insert": {
        const room = geometryRef.current.rooms.find((r) => r.id === hit.roomId);
        if (!room) break;
        const a = room.polygon[hit.edgeIndex]!;
        const b = room.polygon[(hit.edgeIndex + 1) % room.polygon.length]!;
        const world = {
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
        };
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const offset =
          ((world.x - a.x) * (b.x - a.x) + (world.y - a.y) * (b.y - a.y)) / len;
        onSelectRoom(hit.roomId);
        onInsertVertex(hit.roomId, hit.edgeIndex, offset);
        break;
      }
    }
  }

  function startMoveRoom(
    pointerId: number,
    roomId: string,
    clientX: number,
    clientY: number,
  ) {
    const world = clientToWorld(clientX, clientY);
    onSelectRoom(roomId);
    gestureRef.current = {
      kind: "move-room",
      pointerId,
      roomId,
      lastClientX: clientX,
      lastClientY: clientY,
      lastWorldX: world.x,
      lastWorldY: world.y,
    };
    onDocumentGestureStart();
    onInteractionChange(true);
  }

  function promotePendingToDrag(g: Extract<ActiveGesture, { kind: "pending" }>) {
    clearLongPress(g);
    const hit = g.hit;
    const s = selectionRef.current;

    if (hit.kind === "pan") {
      onClearSelection();
      gestureRef.current = {
        kind: "pan",
        pointerId: g.pointerId,
        lastClientX: g.lastClientX,
        lastClientY: g.lastClientY,
      };
      return;
    }

    if (hit.kind === "vertex") {
      onSelectVertex(hit.roomId, hit.vertexIndex);
      gestureRef.current = {
        kind: "move-vertex",
        pointerId: g.pointerId,
        roomId: hit.roomId,
        vertexIndex: hit.vertexIndex,
        lastClientX: g.lastClientX,
        lastClientY: g.lastClientY,
      };
      onDocumentGestureStart();
      return;
    }

    if (hit.kind === "label" && s.labelSelected) {
      gestureRef.current = {
        kind: "move-label",
        pointerId: g.pointerId,
        roomId: hit.roomId,
        lastClientX: g.lastClientX,
        lastClientY: g.lastClientY,
      };
      onDocumentGestureStart();
      return;
    }

    if (
      hit.kind === "opening" &&
      s.selectedOpeningId === hit.openingId &&
      !s.moveLocked
    ) {
      gestureRef.current = {
        kind: "move-opening",
        pointerId: g.pointerId,
        openingId: hit.openingId,
        lastClientX: g.lastClientX,
        lastClientY: g.lastClientY,
      };
      onDocumentGestureStart();
      return;
    }

    if (
      hit.kind === "stairs" &&
      s.selectedStairsId === hit.stairsId &&
      !s.moveLocked
    ) {
      const world = clientToWorld(g.lastClientX, g.lastClientY);
      gestureRef.current = {
        kind: "move-stairs",
        pointerId: g.pointerId,
        stairsId: hit.stairsId,
        lastClientX: g.lastClientX,
        lastClientY: g.lastClientY,
        lastWorldX: world.x,
        lastWorldY: world.y,
      };
      onDocumentGestureStart();
      return;
    }

    if ("roomId" in hit) {
      startMoveRoom(g.pointerId, hit.roomId, g.lastClientX, g.lastClientY);
      return;
    }
    if (s.selectedRoomId) {
      startMoveRoom(
        g.pointerId,
        s.selectedRoomId,
        g.lastClientX,
        g.lastClientY,
      );
      return;
    }

    if (hit.kind === "stairs") {
      const world = clientToWorld(g.lastClientX, g.lastClientY);
      onSelectStairs(hit.stairsId);
      gestureRef.current = {
        kind: "move-stairs",
        pointerId: g.pointerId,
        stairsId: hit.stairsId,
        lastClientX: g.lastClientX,
        lastClientY: g.lastClientY,
        lastWorldX: world.x,
        lastWorldY: world.y,
      };
      onDocumentGestureStart();
      return;
    }

    gestureRef.current = {
      kind: "pan",
      pointerId: g.pointerId,
      lastClientX: g.lastClientX,
      lastClientY: g.lastClientY,
    };
  }

  function onPointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    if (e.button === 2) {
      e.preventDefault();
      const hit = resolveHit(e.clientX, e.clientY);
      applyTapSelection(hit);
      contextCbRef.current({
        clientX: e.clientX,
        clientY: e.clientY,
        hit,
      });
      return;
    }
    if (e.button !== 0) return;

    const existing = gestureRef.current;
    if (
      existing &&
      (existing.kind === "pan" ||
        existing.kind === "pending" ||
        existing.kind === "move-room" ||
        existing.kind === "move-opening" ||
        existing.kind === "move-stairs" ||
        existing.kind === "move-label" ||
        existing.kind === "move-vertex")
    ) {
      if (existing.kind === "pending") clearLongPress(existing);
      if (
        existing.kind === "move-room" ||
        existing.kind === "move-opening" ||
        existing.kind === "move-stairs" ||
        existing.kind === "move-label" ||
        existing.kind === "move-vertex"
      ) {
        onDocumentGestureEnd();
      }
      beginPinch(
        existing.pointerId,
        { x: existing.lastClientX, y: existing.lastClientY },
        e.pointerId,
        { x: e.clientX, y: e.clientY },
      );
      (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    if (existing?.kind === "pinch") {
      existing.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
      return;
    }

    const hit = resolveHit(e.clientX, e.clientY);
    const s = selectionRef.current;

    if (hit.kind === "pan") {
      const pending: Extract<ActiveGesture, { kind: "pending" }> = {
        kind: "pending",
        pointerId: e.pointerId,
        hit,
        startClientX: e.clientX,
        startClientY: e.clientY,
        lastClientX: e.clientX,
        lastClientY: e.clientY,
        longPressTimer: null,
        suppressedContext: false,
      };
      pending.longPressTimer = setTimeout(() => {
        const cur = gestureRef.current;
        if (!cur || cur.kind !== "pending" || cur.pointerId !== e.pointerId) {
          return;
        }
        cur.suppressedContext = true;
        clearLongPress(cur);
        applyTapSelection(cur.hit);
        contextCbRef.current({
          clientX: cur.lastClientX,
          clientY: cur.lastClientY,
          hit: cur.hit,
        });
        gestureRef.current = null;
        onInteractionChange(false);
      }, LONG_PRESS_MS);
      gestureRef.current = pending;
      onInteractionChange(true);
      (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    // Immediate reshape / label / already-selected manipulators
    if (hit.kind === "vertex" && s.reshape) {
      onSelectVertex(hit.roomId, hit.vertexIndex);
      gestureRef.current = {
        kind: "move-vertex",
        pointerId: e.pointerId,
        roomId: hit.roomId,
        vertexIndex: hit.vertexIndex,
        lastClientX: e.clientX,
        lastClientY: e.clientY,
      };
      onDocumentGestureStart();
      onInteractionChange(true);
      (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    if (hit.kind === "edge-insert" && s.reshape) {
      applyTapSelection(hit);
      e.preventDefault();
      return;
    }

    if (hit.kind === "label" && s.labelSelected) {
      gestureRef.current = {
        kind: "move-label",
        pointerId: e.pointerId,
        roomId: hit.roomId,
        lastClientX: e.clientX,
        lastClientY: e.clientY,
      };
      onDocumentGestureStart();
      onInteractionChange(true);
      (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    if (
      hit.kind === "opening" &&
      s.selectedOpeningId === hit.openingId &&
      !s.moveLocked
    ) {
      gestureRef.current = {
        kind: "move-opening",
        pointerId: e.pointerId,
        openingId: hit.openingId,
        lastClientX: e.clientX,
        lastClientY: e.clientY,
      };
      onDocumentGestureStart();
      onInteractionChange(true);
      (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    if (
      hit.kind === "stairs" &&
      s.selectedStairsId === hit.stairsId &&
      !s.moveLocked
    ) {
      const world = clientToWorld(e.clientX, e.clientY);
      gestureRef.current = {
        kind: "move-stairs",
        pointerId: e.pointerId,
        stairsId: hit.stairsId,
        lastClientX: e.clientX,
        lastClientY: e.clientY,
        lastWorldX: world.x,
        lastWorldY: world.y,
      };
      onDocumentGestureStart();
      onInteractionChange(true);
      (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    // Rooms and sub-elements: pending — tap selects, drag moves, long-press menus
    const pending: Extract<ActiveGesture, { kind: "pending" }> = {
      kind: "pending",
      pointerId: e.pointerId,
      hit,
      startClientX: e.clientX,
      startClientY: e.clientY,
      lastClientX: e.clientX,
      lastClientY: e.clientY,
      longPressTimer: null,
      suppressedContext: false,
    };
    pending.longPressTimer = setTimeout(() => {
      const cur = gestureRef.current;
      if (!cur || cur.kind !== "pending" || cur.pointerId !== e.pointerId) {
        return;
      }
      cur.suppressedContext = true;
      clearLongPress(cur);
      applyTapSelection(cur.hit);
      contextCbRef.current({
        clientX: cur.lastClientX,
        clientY: cur.lastClientY,
        hit: cur.hit,
      });
      gestureRef.current = null;
      onInteractionChange(false);
    }, LONG_PRESS_MS);
    gestureRef.current = pending;
    onInteractionChange(true);
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onPointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    const g = gestureRef.current;
    if (!g) return;

    if (g.kind === "pinch") {
      if (!g.pointers.has(e.pointerId)) return;
      g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (g.pointers.size < 2) return;
      const pts = [...g.pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      zoomAt(midX, midY, g.lastDist / dist);
      const svg = svgRef.current;
      if (svg) {
        const rect = svg.getBoundingClientRect();
        const v = viewRef.current;
        const dx = ((midX - g.lastMidX) / rect.width) * v.w;
        const dy = ((midY - g.lastMidY) / rect.height) * v.h;
        setView((prev) => ({ ...prev, x: prev.x - dx, y: prev.y - dy }));
      }
      g.lastDist = dist;
      g.lastMidX = midX;
      g.lastMidY = midY;
      return;
    }

    if (g.kind === "pending" && e.pointerId === g.pointerId) {
      g.lastClientX = e.clientX;
      g.lastClientY = e.clientY;
      const moved = Math.hypot(
        e.clientX - g.startClientX,
        e.clientY - g.startClientY,
      );
      if (moved > DRAG_THRESHOLD_PX) {
        promotePendingToDrag(g);
      }
      return;
    }

    if (g.kind === "pan" && e.pointerId === g.pointerId) {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const v = viewRef.current;
      const dx = ((e.clientX - g.lastClientX) / rect.width) * v.w;
      const dy = ((e.clientY - g.lastClientY) / rect.height) * v.h;
      g.lastClientX = e.clientX;
      g.lastClientY = e.clientY;
      setView((prev) => ({ ...prev, x: prev.x - dx, y: prev.y - dy }));
      return;
    }

    if (g.kind === "move-room" && e.pointerId === g.pointerId) {
      const world = clientToWorld(e.clientX, e.clientY);
      let dx = world.x - g.lastWorldX;
      let dy = world.y - g.lastWorldY;
      g.lastClientX = e.clientX;
      g.lastClientY = e.clientY;
      if (dx === 0 && dy === 0) return;
      const ppi = pixelsPerInch(svgRef.current, viewRef.current);
      const thresholdIn = ROOM_SNAP_THRESHOLD_PX / ppi;
      const snapped = snapRoomTranslation(
        geometryRef.current,
        g.roomId,
        dx,
        dy,
        thresholdIn,
      );
      setSnapGuides(snapped.guides);
      dx = snapped.dx;
      dy = snapped.dy;
      g.lastWorldX = world.x;
      g.lastWorldY = world.y;
      onMoveRoom(g.roomId, dx, dy);
      return;
    }

    if (g.kind === "move-opening" && e.pointerId === g.pointerId) {
      g.lastClientX = e.clientX;
      g.lastClientY = e.clientY;
      const world = clientToWorld(e.clientX, e.clientY);
      const opening = listOpenings(geometryRef.current).find(
        (o) => o.id === g.openingId,
      );
      if (!opening) return;
      const span = openingWorldSpan(geometryRef.current.rooms, opening);
      if (!span) return;
      const edge = span.edge;
      const proj =
        (world.x - edge.a.x) * edge.dir.x + (world.y - edge.a.y) * edge.dir.y;
      onMoveOpening(g.openingId, proj - opening.widthIn / 2);
      return;
    }

    if (g.kind === "move-stairs" && e.pointerId === g.pointerId) {
      const world = clientToWorld(e.clientX, e.clientY);
      const dx = world.x - g.lastWorldX;
      const dy = world.y - g.lastWorldY;
      g.lastClientX = e.clientX;
      g.lastClientY = e.clientY;
      if (dx === 0 && dy === 0) return;
      const ppi = pixelsPerInch(svgRef.current, viewRef.current);
      const thresholdIn = ROOM_SNAP_THRESHOLD_PX / ppi;
      const snapped = snapStairsTranslation(
        geometryRef.current,
        g.stairsId,
        dx,
        dy,
        thresholdIn,
      );
      setSnapGuides(snapped.guides);
      g.lastWorldX = world.x;
      g.lastWorldY = world.y;
      onMoveStairs(g.stairsId, snapped.dx, snapped.dy);
      return;
    }

    if (g.kind === "move-label" && e.pointerId === g.pointerId) {
      g.lastClientX = e.clientX;
      g.lastClientY = e.clientY;
      onMoveLabel(g.roomId, clientToWorld(e.clientX, e.clientY));
      return;
    }

    if (g.kind === "move-vertex" && e.pointerId === g.pointerId) {
      g.lastClientX = e.clientX;
      g.lastClientY = e.clientY;
      const world = clientToWorld(e.clientX, e.clientY);
      const ppi = pixelsPerInch(svgRef.current, viewRef.current);
      const thresholdIn = ROOM_SNAP_THRESHOLD_PX / ppi;
      const snapped = snapOrthoPoint(
        world,
        collectSnapTargets(geometryRef.current, g.roomId),
        thresholdIn,
      );
      onMoveVertex(g.roomId, g.vertexIndex, snapped.x, snapped.y);
    }
  }

  function endPointer(e: ReactPointerEvent<SVGSVGElement>) {
    const g = gestureRef.current;
    if (!g) return;

    if (g.kind === "pinch") {
      g.pointers.delete(e.pointerId);
      if (g.pointers.size < 2) {
        gestureRef.current = null;
        onInteractionChange(false);
      }
      return;
    }

    if (e.pointerId !== g.pointerId) return;

    if (g.kind === "pending") {
      clearLongPress(g);
      if (!g.suppressedContext) {
        applyTapSelection(g.hit);
      }
      gestureRef.current = null;
      onInteractionChange(false);
      return;
    }

    const wasDocument =
      g.kind === "move-room" ||
      g.kind === "move-opening" ||
      g.kind === "move-stairs" ||
      g.kind === "move-label" ||
      g.kind === "move-vertex";
    gestureRef.current = null;
    setSnapGuides([]);
    if (wasDocument) onDocumentGestureEnd();
    onInteractionChange(false);
  }

  const selectedRoom = geometry.rooms.find((r) => r.id === selectedRoomId);
  const selectedWall = geometry.walls.find((w) => w.id === selectedWallId);
  const openings = listOpenings(geometry);
  const guidePad = Math.max(view.w, view.h);
  const handleR = Math.max(
    planTokens.labelHitRadiusIn,
    (22 * view.w) / 390,
  );

  return (
    <div className="relative h-full min-h-0 w-full flex-1">
      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        role="application"
        aria-label="Floor plan canvas"
        className="h-full w-full touch-none select-none"
        style={{ background: planTokens.paper, display: "block" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onContextMenu={(e) => e.preventDefault()}
      >
        <PlanDocument geometry={geometry} style={style} />

        <g data-editor-overlay="true" pointerEvents="none">
          {selectedRoom ? (
            <path
              d={pointsToPath(selectedRoom.polygon)}
              fill="none"
              stroke={planTokens.ink}
              strokeWidth={2.5}
              strokeDasharray="8 6"
            />
          ) : null}

          {selectedWall ? (
            <path
              d={pointsToPath(selectedWall.centerline, false)}
              fill="none"
              stroke="#2563eb"
              strokeWidth={Math.max(selectedWall.thickness, 4)}
              strokeLinecap="round"
              opacity={0.85}
            />
          ) : null}

          {selectedOpeningId
            ? (() => {
                const op = openings.find((o) => o.id === selectedOpeningId);
                if (!op) return null;
                const span = openingWorldSpan(geometry.rooms, op);
                if (!span) return null;
                return (
                  <line
                    x1={span.start.x}
                    y1={span.start.y}
                    x2={span.end.x}
                    y2={span.end.y}
                    stroke="#2563eb"
                    strokeWidth={4}
                    strokeLinecap="round"
                  />
                );
              })()
            : null}

          {selectedStairsId
            ? (() => {
                const stair = geometry.stairs.find(
                  (s) => s.id === selectedStairsId,
                );
                if (!stair) return null;
                return (
                  <path
                    d={pointsToPath(stairsPolygon(stair))}
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth={2.5}
                    strokeDasharray="8 6"
                  />
                );
              })()
            : null}

          {labelSelected && selectedRoom ? (
            <circle
              cx={selectedRoom.labelAnchor.x}
              cy={selectedRoom.labelAnchor.y}
              r={handleR * 0.45}
              fill="#2563eb"
              opacity={0.85}
            />
          ) : null}

          {reshape && selectedRoom
            ? selectedRoom.polygon.map((p, i) => {
                const next =
                  selectedRoom.polygon[(i + 1) % selectedRoom.polygon.length]!;
                const mx = (p.x + next.x) / 2;
                const my = (p.y + next.y) / 2;
                return (
                  <g key={`reshape-${selectedRoom.id}-${i}`}>
                    <circle
                      cx={mx}
                      cy={my}
                      r={3}
                      fill="#2563eb"
                      opacity={0.7}
                    />
                    <rect
                      x={p.x - 4}
                      y={p.y - 4}
                      width={8}
                      height={8}
                      fill={
                        selectedVertexIndex === i ? "#2563eb" : planTokens.ink
                      }
                      stroke={planTokens.paper}
                      strokeWidth={1}
                    />
                  </g>
                );
              })
            : null}

          {snapGuides.map((g, i) =>
            g.kind === "x" ? (
              <line
                key={`snap-x-${i}`}
                x1={g.x}
                y1={view.y - guidePad}
                x2={g.x}
                y2={view.y + view.h + guidePad}
                stroke="#2563eb"
                strokeWidth={1}
                strokeDasharray="4 4"
                opacity={0.7}
              />
            ) : (
              <line
                key={`snap-y-${i}`}
                x1={view.x - guidePad}
                y1={g.y}
                x2={view.x + view.w + guidePad}
                y2={g.y}
                stroke="#2563eb"
                strokeWidth={1}
                strokeDasharray="4 4"
                opacity={0.7}
              />
            ),
          )}
        </g>
      </svg>

      <div className="pointer-events-none absolute right-3 bottom-3 flex flex-col gap-2">
        <button
          type="button"
          className="pointer-events-auto inline-flex min-h-[var(--sp-touch-min)] min-w-[var(--sp-touch-min)] items-center justify-center rounded-sm border border-border bg-elevated px-3 text-sm font-medium text-navy shadow-card"
          onClick={applyFit}
        >
          Fit
        </button>
      </div>
    </div>
  );
}
