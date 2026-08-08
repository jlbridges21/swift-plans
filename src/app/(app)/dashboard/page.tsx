import { Button } from "@/components/ui/Button";

/**
 * Placeholder empty state only. Project list/creation is the next phase.
 */
export default function DashboardPage() {
  return (
    <section className="flex flex-1 flex-col items-start justify-center gap-6 py-8">
      <div className="flex max-w-lg flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Your floor plans
        </h1>
        <p className="text-base leading-relaxed text-fg-muted">
          You don’t have any floor plans yet. Create your first one when you’re
          ready — project creation lands in the next phase.
        </p>
      </div>

      <Button type="button" disabled aria-disabled="true">
        New Floor Plan
      </Button>
    </section>
  );
}
