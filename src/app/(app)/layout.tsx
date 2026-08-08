import Link from "next/link";
import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth/session";
import { signOut } from "@/lib/auth/actions";
import { Button } from "@/components/ui/Button";

export const dynamic = "force-dynamic";

/**
 * Authenticated app shell. requireUser() is the real auth boundary.
 * Width constraints live on individual pages so the editor can go wider.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-background">
      <header className="border-b border-border bg-elevated pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link
            href="/dashboard"
            className="text-lg font-semibold tracking-tight text-navy"
          >
            Swift Plans
          </Link>

          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <p
              className="truncate text-sm text-fg-muted"
              title={user.email ?? undefined}
            >
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

      <div className="flex flex-1 flex-col pb-[max(1rem,env(safe-area-inset-bottom))]">
        {children}
      </div>
    </div>
  );
}
