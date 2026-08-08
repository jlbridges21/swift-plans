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
  onSelectRoom: (roomId: string | null) => void;
  onMoveRoom: (roomId: string, dx: number, dy: number) => void;
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
  onSelectRoom,
  onMoveRoom,
  onInteractionChange,
}: EditorCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const geometryRef = useRef(geometry);
  const [view, setView] = useState<CameraViewBox>(() =>
    fitView(geometry, 390, 520),
  );
  const viewRef = useRef(view);

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

  // Zoom-to-fit once on load
  useEffect(() => {
    if (didInitialFit.current) return;
    didInitialFit.current = true;
    applyFit();
    const id = requestAnimationFrame(() => applyFit());
    return () => cancelAnimationFrame(id);
  }, [applyFit]);

  // Non-passive wheel so trackpad pinch / zoom can preventDefault
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

  // Re-fit when rooms are added or removed (not on move/resize)
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

    // Second finger → pinch (overrides pan / room-move)
    if (
      existing &&
      (existing.kind === "pan" || existing.kind === "move-room")
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
    const hitRoom = target.closest("[data-room-hit]");
    const roomId = hitRoom?.getAttribute("data-room-hit") ?? null;

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
      const dx = world.x - g.lastWorldX;
      const dy = world.y - g.lastWorldY;
      g.lastClientX = e.clientX;
      g.lastClientY = e.clientY;
      if (dx !== 0 || dy !== 0) {
        g.lastWorldX = world.x;
        g.lastWorldY = world.y;
        onMoveRoom(g.roomId, dx, dy);
      }
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
    onInteractionChange(false);
  }

  const selected = geometry.rooms.find((r) => r.id === selectedRoomId);

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
          {selected ? (
            <path
              d={pointsToPath(selected.polygon)}
              fill="none"
              stroke={planTokens.ink}
              strokeWidth={2.5}
              strokeDasharray="8 6"
              pointerEvents="none"
            />
          ) : null}
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
