"use client";

import { useEffect, useSyncExternalStore } from "react";
import { PlanDrawing } from "@/components/plan/PlanDrawing";
import type { PlanBranding } from "@/lib/plan/branding";
import type { PlanStyleSettings } from "@/lib/plan/style-settings";
import { DEFAULT_PLAN_STYLE } from "@/lib/plan/style-settings";
import type { FloorGeometry } from "@/types/plan-geometry";

type PrintFloor = {
  name: string;
  geometry: FloorGeometry;
};

type PrintPayload = {
  projectName: string;
  branded: boolean;
  branding: PlanBranding | null;
  style: PlanStyleSettings;
  floors: PrintFloor[];
};

type StoreSnapshot =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; payload: PrintPayload };

const STORAGE_KEY = "swift-plans-print-export";

let cached: StoreSnapshot = { status: "loading" };
let cleared = false;

function readStore(): StoreSnapshot {
  if (typeof window === "undefined") return { status: "loading" };
  if (cached.status !== "loading") return cached;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cached = {
        status: "error",
        message: "No print job found. Export PDF from the editor again.",
      };
      return cached;
    }
    const parsed = JSON.parse(raw) as PrintPayload;
    if (!parsed.floors?.length) {
      cached = { status: "error", message: "Print job has no floors." };
      return cached;
    }
    cached = {
      status: "ready",
      payload: {
        ...parsed,
        style: parsed.style ?? DEFAULT_PLAN_STYLE,
      },
    };
    if (!cleared) {
      cleared = true;
      sessionStorage.removeItem(STORAGE_KEY);
    }
    return cached;
  } catch {
    cached = { status: "error", message: "Could not read the print job." };
    return cached;
  }
}

function subscribe() {
  return () => {};
}

export default function ExportPrintPage() {
  const snapshot = useSyncExternalStore(subscribe, readStore, () => ({
    status: "loading" as const,
  }));

  useEffect(() => {
    if (snapshot.status !== "ready") return;
    const t = window.setTimeout(() => {
      window.print();
    }, 400);
    return () => window.clearTimeout(t);
  }, [snapshot]);

  if (snapshot.status === "error") {
    return (
      <main className="mx-auto max-w-lg p-8 font-sans text-slate-800">
        <h1 className="text-xl font-semibold">Print export</h1>
        <p className="mt-2 text-sm">{snapshot.message}</p>
      </main>
    );
  }

  if (snapshot.status === "loading") {
    return (
      <main className="mx-auto max-w-lg p-8 font-sans text-slate-800">
        <p className="text-sm">Preparing pages…</p>
      </main>
    );
  }

  const { payload } = snapshot;
  const branding =
    payload.branded && payload.branding ? payload.branding : null;

  return (
    <>
      <style>{`
        @page {
          size: letter;
          margin: 0.5in;
        }
        @media print {
          .no-print { display: none !important; }
          .print-page {
            break-after: page;
            page-break-after: always;
            margin: 0;
            padding: 0;
          }
          .print-page:last-child {
            break-after: auto;
            page-break-after: auto;
          }
          body {
            margin: 0;
            background: white;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
        @media screen {
          body {
            background: #e2e8f0;
          }
          .print-toolbar {
            position: sticky;
            top: 0;
            z-index: 10;
            display: flex;
            gap: 0.75rem;
            align-items: center;
            padding: 0.75rem 1rem;
            background: white;
            border-bottom: 1px solid #cbd5e1;
          }
          .print-page {
            max-width: 8.5in;
            margin: 1rem auto;
            padding: 0.5in;
            background: white;
            box-shadow: 0 1px 4px rgba(15, 23, 42, 0.12);
          }
        }
      `}</style>

      <div className="print-toolbar no-print">
        <button
          type="button"
          className="rounded border border-slate-300 bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          onClick={() => window.print()}
        >
          Print / Save as PDF
        </button>
        <span className="text-sm text-slate-600">
          {payload.projectName} — {payload.floors.length} floor
          {payload.floors.length === 1 ? "" : "s"}
        </span>
      </div>

      {payload.floors.map((floor) => (
        <section
          key={floor.name}
          className="print-page"
          aria-label={floor.name}
        >
          <PlanDrawing
            geometry={floor.geometry}
            style={payload.style}
            branding={branding}
            embedFont={false}
          />
        </section>
      ))}
    </>
  );
}
