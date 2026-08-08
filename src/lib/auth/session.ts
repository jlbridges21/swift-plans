import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Verified current user, or null. Cached per request via React cache().
 */
export const getUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * Verified current user, or redirect to sign-in.
 * Call this in every protected page and Server Action — do not rely on Proxy alone.
 */
export const requireUser = cache(async (): Promise<User> => {
  const user = await getUser();
  if (!user) {
    redirect("/sign-in");
  }
  return user;
});
