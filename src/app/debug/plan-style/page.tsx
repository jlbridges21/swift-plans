import {
  PlanDrawing,
  planVariantCopy,
  type PlanVariantId,
} from "@/components/plan/PlanDrawing";

const variants: PlanVariantId[] = ["minimal", "warm", "textured"];

export default function PlanStyleDebugPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-14 px-4 py-10 sm:px-8">
      <header className="flex max-w-2xl flex-col gap-3">
        <p className="text-sm font-medium tracking-wide text-accent uppercase">
          Debug · Plan style
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Floor plan visual directions
        </h1>
        <p className="text-base leading-relaxed text-fg-muted">
          Three hand-authored reference renderings of the same geometry. This is
          the visual target for later editor and export work — not live plan
          data.
        </p>
      </header>

      {variants.map((id) => {
        const copy = planVariantCopy[id];
        return (
          <section key={id} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                {copy.title}
              </h2>
              <p className="max-w-2xl text-sm leading-relaxed text-fg-muted">
                {copy.intent}
              </p>
            </div>
            <div className="overflow-hidden rounded-lg border border-border bg-[#f7f3ec]">
              <PlanDrawing variant={id} />
            </div>
          </section>
        );
      })}
    </main>
  );
}
