import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { createClient } from "@/lib/supabase/server";

/** Always hit Supabase at request time — this page is a live smoke test. */
export const dynamic = "force-dynamic";

type SmokeTestResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

async function runSupabaseSmokeTest(): Promise<SmokeTestResult> {
  try {
    const supabase = await createClient();

    // With RLS default-deny, anon gets 0 rows — that is success (no error).
    const { error } = await supabase.from("projects").select("id").limit(1);

    if (error) {
      return {
        ok: false,
        message: error.message,
      };
    }

    return {
      ok: true,
      message: "Connected. Query succeeded (RLS may return zero rows).",
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown Supabase connection error";
    return { ok: false, message };
  }
}

export default async function DebugSupabasePage() {
  const smoke = await runSupabaseSmokeTest();

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-10 px-5 py-12 sm:px-8">
      <header className="flex flex-col gap-3">
        <p className="text-sm font-medium tracking-wide text-accent uppercase">
          Debug
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Swift Plans
        </h1>
        <p className="max-w-md text-base leading-relaxed text-fg-muted">
          Foundation smoke test. Design tokens, shared UI primitives, and a live
          Supabase connection.
        </p>
      </header>

      <section
        aria-label="Supabase connection status"
        className="rounded-lg border border-border bg-elevated/80 px-5 py-4 backdrop-blur-sm"
      >
        <p className="text-sm font-medium text-foreground">Supabase</p>
        <p
          className={[
            "mt-1 text-sm leading-relaxed",
            smoke.ok ? "text-success" : "text-danger",
          ].join(" ")}
        >
          {smoke.ok ? "Connected" : "Not connected"} — {smoke.message}
        </p>
      </section>

      <section
        aria-label="Design system primitives"
        className="flex flex-col gap-5"
      >
        <p className="text-sm font-medium text-foreground">UI primitives</p>
        <Input
          label="Sample field"
          name="sample"
          placeholder="44px minimum touch height"
          hint="Pattern only — not wired to anything."
          readOnly
        />
        <div className="flex flex-wrap gap-3">
          <Button type="button">Primary</Button>
          <Button type="button" variant="secondary">
            Secondary
          </Button>
          <Button type="button" variant="ghost">
            Ghost
          </Button>
        </div>
      </section>
    </main>
  );
}
