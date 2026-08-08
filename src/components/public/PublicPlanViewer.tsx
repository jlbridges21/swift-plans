"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PlanDocument, planViewBox } from "@/components/plan/PlanDrawing";
import { planTokens } from "@/lib/plan-style/tokens";
import type { PlanStyleSettings } from "@/lib/plan/style-settings";
import type { FloorGeometry } from "@/types/plan-geometry";

type Camera = { x: number; y: number; w: number; h: number };

const MIN_VIEW_IN = 24;
const MAX_VIEW_IN = 12000;
const FIT_PADDING = 1.12;

function clampView(view: Camera): Camera {
  const w = Math.min(MAX_VIEW_IN, Math.max(MIN_VIEW_IN, view.w));
  const h = Math.min(MAX_VIEW_IN, Math.max(MIN_VIEW_IN, view.h));
  return { x: view.x, y: view.y, w, h };
}

function fitView(
  geometry: FloorGeometry,
  viewportW: number,
  viewportH: number,
): Camera {
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

type PublicPlanViewerProps = {
  geometry: FloorGeometry;
  style: PlanStyleSettings;
  floors: { id: string; name: string }[];
  activeFloorId: string;
  onFloorChange: (floorId: string) => void;
  projectName: string;
};

/**
 * Read-only pan / pinch-zoom / fit viewer. No editing chrome.
 */
export function PublicPlanViewer({
  geometry,
  style,
  floors,
  activeFloorId,
  onFloorChange,
  projectName,
}: PublicPlanViewerProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<Camera>(() => fitView(geometry, 800, 600));
  const viewRef = useRef(view);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const panRef = useRef<{
    x: number;
    y: number;
    view: Camera;
  } | null>(null);
  const pinchRef = useRef<{
    dist: number;
    view: Camera;
    cx: number;
    cy: number;
  } | null>(null);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const applyFit = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const next = fitView(geometry, el.clientWidth, el.clientHeight);
    setView(next);
  }, [geometry]);

  useEffect(() => {
    applyFit();
  }, [applyFit, activeFloorId]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => applyFit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [applyFit]);

  function clientToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const el = wrapRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const v = viewRef.current;
    return {
      x: v.x + ((clientX - rect.left) / Math.max(rect.width, 1)) * v.w,
      y: v.y + ((clientY - rect.top) / Math.max(rect.height, 1)) * v.h,
    };
  }

  function zoomAt(clientX: number, clientY: number, factor: number) {
    const before = clientToWorld(clientX, clientY);
    const v = viewRef.current;
    const next = clampView({
      x: v.x,
      y: v.y,
      w: v.w * factor,
      h: v.h * factor,
    });
    const el = wrapRef.current;
    if (!el) {
      setView(next);
      return;
    }
    const rect = el.getBoundingClientRect();
    const afterX =
      next.x + ((clientX - rect.left) / Math.max(rect.width, 1)) * next.w;
    const afterY =
      next.y + ((clientY - rect.top) / Math.max(rect.height, 1)) * next.h;
    setView(
      clampView({
        x: next.x + (before.x - afterX),
        y: next.y + (before.y - afterY),
        w: next.w,
        h: next.h,
      }),
    );
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 1) {
      panRef.current = {
        x: e.clientX,
        y: e.clientY,
        view: { ...viewRef.current },
      };
      pinchRef.current = null;
    } else if (pointersRef.current.size === 2) {
      const pts = [...pointersRef.current.values()];
      const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      pinchRef.current = {
        dist: Math.max(dist, 1),
        view: { ...viewRef.current },
        cx: (pts[0]!.x + pts[1]!.x) / 2,
        cy: (pts[0]!.y + pts[1]!.y) / 2,
      };
      panRef.current = null;
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinchRef.current && pointersRef.current.size >= 2) {
      const pts = [...pointersRef.current.values()];
      const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      const factor = pinchRef.current.dist / Math.max(dist, 1);
      const v = pinchRef.current.view;
      const next = clampView({
        x: v.x,
        y: v.y,
        w: v.w * factor,
        h: v.h * factor,
      });
      // Keep pinch midpoint stable in world space
      const el = wrapRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const cx = (pts[0]!.x + pts[1]!.x) / 2;
        const cy = (pts[0]!.y + pts[1]!.y) / 2;
        const before = {
          x:
            pinchRef.current.view.x +
            ((pinchRef.current.cx - rect.left) / Math.max(rect.width, 1)) *
              pinchRef.current.view.w,
          y:
            pinchRef.current.view.y +
            ((pinchRef.current.cy - rect.top) / Math.max(rect.height, 1)) *
              pinchRef.current.view.h,
        };
        const afterX =
          next.x + ((cx - rect.left) / Math.max(rect.width, 1)) * next.w;
        const afterY =
          next.y + ((cy - rect.top) / Math.max(rect.height, 1)) * next.h;
        setView(
          clampView({
            x: next.x + (before.x - afterX),
            y: next.y + (before.y - afterY),
            w: next.w,
            h: next.h,
          }),
        );
      } else {
        setView(next);
      }
      return;
    }

    if (panRef.current && pointersRef.current.size === 1) {
      const el = wrapRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const v0 = panRef.current.view;
      const dx =
        ((e.clientX - panRef.current.x) / Math.max(rect.width, 1)) * v0.w;
      const dy =
        ((e.clientY - panRef.current.y) / Math.max(rect.height, 1)) * v0.h;
      setView(
        clampView({
          x: v0.x - dx,
          y: v0.y - dy,
          w: v0.w,
          h: v0.h,
        }),
      );
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 0) panRef.current = null;
    if (pointersRef.current.size === 1) {
      const remaining = [...pointersRef.current.entries()][0]!;
      panRef.current = {
        x: remaining[1].x,
        y: remaining[1].y,
        view: { ...viewRef.current },
      };
    }
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.1 : 1 / 1.1;
    zoomAt(e.clientX, e.clientY, factor);
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-paper">
      <header
        className={[
          "relative z-10 flex shrink-0 flex-wrap items-center justify-between gap-2",
          "border-b border-border bg-elevated/95 px-3 py-2 backdrop-blur-sm",
          "pt-[max(0.5rem,env(safe-area-inset-top))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]",
        ].join(" ")}
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-navy">{projectName}</p>
          <p className="text-xs text-fg-muted">Floor plan</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {floors.length > 1 ? (
            <div
              className="flex max-w-full gap-1 overflow-x-auto"
              role="tablist"
              aria-label="Floors"
            >
              {floors.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={f.id === activeFloorId}
                  className={[
                    "inline-flex min-h-[44px] shrink-0 items-center rounded-sm px-3 text-sm font-medium",
                    f.id === activeFloorId
                      ? "bg-navy text-white"
                      : "bg-tinted text-navy",
                  ].join(" ")}
                  onClick={() => onFloorChange(f.id)}
                >
                  {f.name}
                </button>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-sm border border-border bg-elevated px-3 text-sm font-medium text-navy"
            onClick={applyFit}
          >
            Fit
          </button>
        </div>
      </header>

      <div
        ref={wrapRef}
        className="relative min-h-0 flex-1 touch-none overflow-hidden pb-[env(safe-area-inset-bottom)]"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        <svg
          width="100%"
          height="100%"
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          style={{ display: "block", background: planTokens.paper }}
          role="img"
          aria-label={projectName}
        >
          <rect
            x={view.x}
            y={view.y}
            width={view.w}
            height={view.h}
            fill={planTokens.paper}
          />
          <PlanDocument geometry={geometry} style={style} />
        </svg>
      </div>
    </div>
  );
}
