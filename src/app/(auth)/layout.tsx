import type { ReactNode } from "react";

/**
 * Centered, narrow auth card layout — mobile-first.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-5 py-10 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:px-8">
      <div className="w-full max-w-md">
        <p className="mb-8 text-center text-xl font-semibold tracking-tight text-foreground">
          Swift Plans
        </p>
        <div className="rounded-lg border border-border bg-elevated/90 px-5 py-8 shadow-sm backdrop-blur-sm sm:px-8">
          {children}
        </div>
      </div>
    </main>
  );
}
