import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/paths";

/**
 * PKCE code exchange for email confirmation, OAuth, and password-recovery links.
 * Supports ?next=/relative-path (validated) for post-auth landing.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"), "/dashboard", origin);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  const failure = new URL("/sign-in", origin);
  failure.searchParams.set(
    "error",
    "That sign-in link is invalid or has expired. Please try again.",
  );
  return NextResponse.redirect(failure);
}
