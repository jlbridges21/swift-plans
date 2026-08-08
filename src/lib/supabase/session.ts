import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const AUTH_PAGES = new Set([
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  // /reset-password is intentionally omitted: recovery links establish a
  // session, and the user must stay on that page while authenticated.
]);

function isProtectedPath(pathname: string): boolean {
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
}

function redirectWithSessionCookies(
  request: NextRequest,
  pathname: string,
  sessionResponse: NextResponse,
) {
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = pathname;
  // Deliberate: clearing search for now; return-to-origin is a later concern.
  redirectUrl.search = "";

  const redirectResponse = NextResponse.redirect(redirectUrl);
  // Copy the full cookie object so path/secure/sameSite/httpOnly/maxAge survive.
  sessionResponse.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie);
  });
  return redirectResponse;
}

/**
 * Refresh the Supabase auth session cookies and apply optimistic redirects.
 * Proxy-only — every protected page/action still calls requireUser().
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  // Validates the JWT and refreshes cookies when needed. Do not use getSession().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && isProtectedPath(pathname)) {
    return redirectWithSessionCookies(request, "/sign-in", supabaseResponse);
  }

  if (user && AUTH_PAGES.has(pathname)) {
    return redirectWithSessionCookies(request, "/dashboard", supabaseResponse);
  }

  return supabaseResponse;
}
