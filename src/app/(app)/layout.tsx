import Link from "next/link";
import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth/session";
import { signOut } from "@/lib/auth/actions";
import { Button } from "@/components/ui/Button";

export const dynamic = "force-dynamic";

/**
 * Authenticated app shell. requireUser() is the real auth boundary.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-border bg-elevated/80 backdrop-blur-sm pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link
            href="/dashboard"
            className="text-lg font-semibold tracking-tight text-foreground"
          >
            Swift Plans
          </Link>

          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <p className="truncate text-sm text-fg-muted" title={user.email ?? undefined}>
              {user.email}
            </p>
            <form action={signOut}>
              <Button type="submit" variant="ghost" className="shrink-0 px-3">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-8">
        {children}
      </div>
    </div>
  );
}
