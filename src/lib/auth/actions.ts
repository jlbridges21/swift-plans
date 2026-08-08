"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GENERIC_EMAIL_SENT, mapAuthError } from "@/lib/auth/errors";
import { getSiteUrl } from "@/lib/site-url";

export type AuthActionState = {
  error?: string;
  success?: string;
  needsConfirmation?: boolean;
};

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function validateEmail(email: string): string | null {
  if (!email) {
    return "Enter your email address.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Enter a valid email address.";
  }
  return null;
}

function validatePassword(password: string, { min = 8 } = {}): string | null {
  if (!password) {
    return "Enter a password.";
  }
  if (password.length < min) {
    return `Password must be at least ${min} characters.`;
  }
  return null;
}

export async function signUp(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = readString(formData, "email");
  const password = readString(formData, "password");

  const emailError = validateEmail(email);
  if (emailError) {
    return { error: emailError };
  }
  const passwordError = validatePassword(password);
  if (passwordError) {
    return { error: passwordError };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${getSiteUrl()}/auth/callback`,
    },
  });

  if (error) {
    // Avoid revealing whether the email is already registered.
    if (
      error.message.toLowerCase().includes("already") ||
      error.code === "user_already_exists"
    ) {
      return {
        success: GENERIC_EMAIL_SENT,
        needsConfirmation: true,
      };
    }
    return { error: mapAuthError(error) };
  }

  // Confirmation disabled → session present → signed in.
  if (data.session) {
    redirect("/dashboard");
  }

  // Confirmation enabled → no session yet.
  return {
    needsConfirmation: true,
    success: "Check your email to confirm your account.",
  };
}

export async function signIn(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = readString(formData, "email");
  const password = readString(formData, "password");

  const emailError = validateEmail(email);
  if (emailError) {
    return { error: emailError };
  }
  if (!password) {
    return { error: "Enter your password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: mapAuthError(error) };
  }

  redirect("/dashboard");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}

export async function forgotPassword(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = readString(formData, "email");
  const emailError = validateEmail(email);
  if (emailError) {
    return { error: emailError };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${getSiteUrl()}/auth/callback?next=/reset-password`,
  });

  // Always show the same message — do not reveal whether the email exists.
  if (error) {
    // Rate limits and config errors can still be useful; keep them generic otherwise.
    if (
      error.message.toLowerCase().includes("rate") ||
      error.code === "over_email_send_rate_limit"
    ) {
      return { error: mapAuthError(error) };
    }
  }

  return { success: GENERIC_EMAIL_SENT };
}

export async function resetPassword(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const password = readString(formData, "password");
  const confirm = readString(formData, "confirmPassword");

  const passwordError = validatePassword(password);
  if (passwordError) {
    return { error: passwordError };
  }
  if (password !== confirm) {
    return { error: "Passwords do not match." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error:
        "This reset link has expired or is no longer valid. Request a new one.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: mapAuthError(error) };
  }

  redirect("/dashboard");
}

export async function signInWithGoogle(
  prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  void prev;
  void formData;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${getSiteUrl()}/auth/callback`,
    },
  });

  if (error) {
    return { error: mapAuthError(error) };
  }

  if (!data.url) {
    return { error: "Could not start Google sign-in. Please try again." };
  }

  redirect(data.url);
}
