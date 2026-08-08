import { PlanDrawing } from "@/components/plan/PlanDrawing";
import { sampleFloorGeometry } from "@/components/plan/sample-plan";
import { buildGeneratedComparePlan } from "@/lib/plan/generated-compare-plan";
import { migrateGeometry } from "@/lib/plan/room-ops";
import { DEFAULT_PLAN_STYLE } from "@/lib/plan/style-settings";

export const dynamic = "force-dynamic";

export default function PlanComparePage() {
  const sample = migrateGeometry(sampleFloorGeometry).geometry;
  const generated = buildGeneratedComparePlan();
  const style = DEFAULT_PLAN_STYLE;

  return (
    <main className="min-h-dvh bg-paper px-4 py-8 sm:px-8">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight text-navy">
        Plan quality compare
      </h1>
      <p className="mb-8 max-w-3xl text-sm text-fg-muted">
        Left: hand-authored sample. Right: built through room-ops (adjoining
        rooms, L-shaped bedroom, door, window, opening, stairs). Zoom both and
        inspect exterior corners for notches, gaps, and seams.
      </p>
      <div className="grid gap-10 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-navy uppercase">
            Sample (hand-authored)
          </h2>
          <div className="overflow-hidden rounded-lg border border-border bg-white shadow-card">
            <PlanDrawing geometry={sample} style={style} />
          </div>
        </section>
        <section>
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-navy uppercase">
            Generated (room-ops)
          </h2>
          <div className="overflow-hidden rounded-lg border border-border bg-white shadow-card">
            <PlanDrawing geometry={generated} style={style} />
          </div>
        </section>
      </div>
    </main>
  );
}
