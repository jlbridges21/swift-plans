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
import { listOpenings } from "@/lib/plan/openings";
import { openingWorldSpan } from "@/lib/plan/openings";
import { stairsPolygon } from "@/lib/plan/stairs";
import type { FloorGeometry } from "@/types/plan-geometry";

export type CameraViewBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type EditorCanvasProps = {
  geometry: FloorGeometry;
  selectedRoomId: string | null;
  selectedWallId: string | null;
  selectedOpeningId: string | null;
  selectedStairsId: string | null;
  onSelectRoom: (roomId: string | null) => void;
  onSelectWall: (wallId: string | null) => void;
  onSelectOpening: (openingId: string | null) => void;
  onSelectStairs: (stairsId: string | null) => void;
  onMoveRoom: (roomId: string, dx: number, dy: number) => void;
  onMoveOpening: (openingId: string, offsetIn: number) => void;
  onMoveStairs: (stairsId: string, dx: number, dy: number) => void;
  onInteractionChange: (active: boolean) => void;
};

const MIN_VIEW_IN = 24;
const MAX_VIEW_IN = 12000;
const FIT_PADDING = 1.12;

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
    w = h * viewAspect;
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
      kind: "pinch";
      pointers: Map<number, { x: number; y: number }>;
      lastDist: number;
      lastMidX: number;
      lastMidY: number;
    };

/**
 * Interactive plan canvas: PlanDocument + separate hit/selection overlay.
 * Camera is viewBox-only — never mutates geometry for zoom/pan.
 */
export function EditorCanvas({
  geometry,
  selectedRoomId,
  selectedWallId,
  selectedOpeningId,
  selectedStairsId,
  onSelectRoom,
  onSelectWall,
  onSelectOpening,
  onSelectStairs,
  onMoveRoom,
  onMoveOpening,
  onMoveStairs,
  onInteractionChange,
}: EditorCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const geometryRef = useRef(geometry);
  const [view, setView] = useState<CameraViewBox>(() =>
    fitView(geometry, 390, 520),
  );
  const viewRef = useRef(view);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);

  useEffect(() => {
    geometryRef.current = geometry;
  }, [geometry]);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const gestureRef = useRef<ActiveGesture | null>(null);
  const didInitialFit = useRef(false);
  const prevRoomCount = useRef(geometry.rooms.length);

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
      if (didInitialFit.current) {
        applyFit();
      }
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

  function onPointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    const existing = gestureRef.current;

    if (
      existing &&
      (existing.kind === "pan" ||
        existing.kind === "move-room" ||
        existing.kind === "move-opening" ||
        existing.kind === "move-stairs")
    ) {
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

    const target = e.target as Element;
    const hitOpening = target.closest("[data-opening-hit]");
    const openingId = hitOpening?.getAttribute("data-opening-hit") ?? null;
    const hitStairs = target.closest("[data-stairs-hit]");
    const stairsId = hitStairs?.getAttribute("data-stairs-hit") ?? null;
    const hitWall = target.closest("[data-wall-hit]");
    const wallId = hitWall?.getAttribute("data-wall-hit") ?? null;
    const hitRoom = target.closest("[data-room-hit]");
    const roomId = hitRoom?.getAttribute("data-room-hit") ?? null;

    if (openingId) {
      onSelectOpening(openingId);
      gestureRef.current = {
        kind: "move-opening",
        pointerId: e.pointerId,
        openingId,
        lastClientX: e.clientX,
        lastClientY: e.clientY,
      };
      onInteractionChange(true);
      (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    if (stairsId) {
      onSelectStairs(stairsId);
      const world = clientToWorld(e.clientX, e.clientY);
      gestureRef.current = {
        kind: "move-stairs",
        pointerId: e.pointerId,
        stairsId,
        lastClientX: e.clientX,
        lastClientY: e.clientY,
        lastWorldX: world.x,
        lastWorldY: world.y,
      };
      onInteractionChange(true);
      (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    if (wallId) {
      onSelectWall(wallId);
      e.preventDefault();
      return;
    }

    if (roomId) {
      onSelectRoom(roomId);
      const world = clientToWorld(e.clientX, e.clientY);
      gestureRef.current = {
        kind: "move-room",
        pointerId: e.pointerId,
        roomId,
        lastClientX: e.clientX,
        lastClientY: e.clientY,
        lastWorldX: world.x,
        lastWorldY: world.y,
      };
      onInteractionChange(true);
      (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    onSelectRoom(null);
    onSelectWall(null);
    onSelectOpening(null);
    onSelectStairs(null);
    gestureRef.current = {
      kind: "pan",
      pointerId: e.pointerId,
      lastClientX: e.clientX,
      lastClientY: e.clientY,
    };
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

      const svg = svgRef.current;
      const rect = svg?.getBoundingClientRect();
      const v = viewRef.current;
      const pxPerIn = rect && rect.width > 0 ? rect.width / v.w : 1;
      const thresholdIn = ROOM_SNAP_THRESHOLD_PX / pxPerIn;

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
      const room = geometryRef.current.rooms.find((r) => r.id === opening.roomId);
      if (!room) return;
      const span = openingWorldSpan(geometryRef.current.rooms, opening);
      if (!span) return;
      const edge = span.edge;
      const proj =
        (world.x - edge.a.x) * edge.dir.x + (world.y - edge.a.y) * edge.dir.y;
      const newOffset = proj - opening.widthIn / 2;
      onMoveOpening(g.openingId, newOffset);
      return;
    }

    if (g.kind === "move-stairs" && e.pointerId === g.pointerId) {
      const world = clientToWorld(e.clientX, e.clientY);
      const dx = world.x - g.lastWorldX;
      const dy = world.y - g.lastWorldY;
      g.lastClientX = e.clientX;
      g.lastClientY = e.clientY;
      if (dx === 0 && dy === 0) return;
      const svg = svgRef.current;
      const rect = svg?.getBoundingClientRect();
      const v = viewRef.current;
      const pxPerIn = rect && rect.width > 0 ? rect.width / v.w : 1;
      const thresholdIn = ROOM_SNAP_THRESHOLD_PX / pxPerIn;
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
    gestureRef.current = null;
    setSnapGuides([]);
    onInteractionChange(false);
  }

  const selectedRoom = geometry.rooms.find((r) => r.id === selectedRoomId);
  const selectedWall = geometry.walls.find((w) => w.id === selectedWallId);
  const openings = listOpenings(geometry);

  // ~24px hit stroke in document inches at current zoom
  const hitStrokeIn = Math.max(8, (24 * view.w) / 390);
  const guidePad = Math.max(view.w, view.h);

  return (
    <div className="relative flex min-h-[min(62dvh,560px)] w-full flex-1 flex-col">
      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        role="application"
        aria-label="Floor plan canvas"
        className="h-full min-h-[min(62dvh,560px)] w-full touch-none select-none"
        style={{ background: planTokens.paper, display: "block" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      >
        <PlanDocument geometry={geometry} />

        <g data-editor-overlay="true">
          {geometry.rooms.map((room) => (
            <path
              key={`hit-${room.id}`}
              data-room-hit={room.id}
              d={pointsToPath(room.polygon)}
              fill="transparent"
              stroke="transparent"
              strokeWidth={12}
              style={{ cursor: "grab", touchAction: "none" }}
            />
          ))}

          {geometry.stairs.map((stair) => (
            <path
              key={`hit-stairs-${stair.id}`}
              data-stairs-hit={stair.id}
              d={pointsToPath(stairsPolygon(stair))}
              fill="transparent"
              stroke="transparent"
              strokeWidth={12}
              style={{ cursor: "grab", touchAction: "none" }}
            />
          ))}

          {/* Wall hits above rooms so shared/exterior edges stay selectable */}
          {geometry.walls.map((wall) => {
            const d = pointsToPath(wall.centerline, false);
            return (
              <path
                key={`hit-wall-${wall.id}`}
                data-wall-hit={wall.id}
                d={d}
                fill="none"
                stroke="transparent"
                strokeWidth={hitStrokeIn}
                strokeLinecap="round"
                style={{ cursor: "pointer", touchAction: "none" }}
              />
            );
          })}

          {openings.map((op) => {
            const span = openingWorldSpan(geometry.rooms, op);
            if (!span) return null;
            return (
              <line
                key={`hit-op-${op.id}`}
                data-opening-hit={op.id}
                x1={span.start.x}
                y1={span.start.y}
                x2={span.end.x}
                y2={span.end.y}
                stroke="transparent"
                strokeWidth={hitStrokeIn}
                strokeLinecap="round"
                style={{ cursor: "grab", touchAction: "none" }}
              />
            );
          })}

          {selectedRoom ? (
            <path
              d={pointsToPath(selectedRoom.polygon)}
              fill="none"
              stroke={planTokens.ink}
              strokeWidth={2.5}
              strokeDasharray="8 6"
              pointerEvents="none"
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
              pointerEvents="none"
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
                    pointerEvents="none"
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
                    pointerEvents="none"
                  />
                );
              })()
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
                pointerEvents="none"
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
                pointerEvents="none"
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
