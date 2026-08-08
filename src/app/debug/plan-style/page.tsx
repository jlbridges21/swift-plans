import { PlanDrawing } from "@/components/plan/PlanDrawing";
import { sampleFloorGeometry } from "@/components/plan/sample-plan";

export default function PlanStyleDebugPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-10 sm:px-8">
      <header className="flex max-w-2xl flex-col gap-3">
        <p className="text-sm font-medium tracking-wide text-accent uppercase">
          Debug · Plan style
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Floor plan reference
        </h1>
        <p className="text-base leading-relaxed text-fg-muted">
          Single hand-authored reference rendering — the visual target for later
          editor and export work. Not live plan data.
        </p>
      </header>

      <section className="overflow-hidden rounded-lg border border-border bg-[#f5f0e6]">
        <PlanDrawing geometry={sampleFloorGeometry} />
      </section>
    </main>
  );
}
