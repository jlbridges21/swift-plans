"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { signUp, type AuthActionState } from "@/lib/auth/actions";

const initialState: AuthActionState = {};

export function SignUpForm() {
  const [state, action] = useActionState(signUp, initialState);

  if (state.needsConfirmation) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <p className="text-base font-medium text-foreground">
          Check your email
        </p>
        <p className="text-sm leading-relaxed text-fg-muted">
          {state.success ??
            "Check your email to confirm your account before signing in."}
        </p>
        <Link
          href="/sign-in"
          className="inline-flex min-h-[var(--sp-touch-min)] items-center justify-center text-sm font-medium text-accent hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <GoogleButton label="Continue with Google" />

      <div className="flex items-center gap-3 text-xs text-fg-subtle">
        <span className="h-px flex-1 bg-border" />
        <span>or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form action={action} className="flex flex-col gap-4">
        <Input
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
        <Input
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters"
          required
        />

        {state.error ? (
          <p className="text-sm text-danger" role="alert">
            {state.error}
          </p>
        ) : null}

        <SubmitButton pendingLabel="Creating account…">
          Create account
        </SubmitButton>
      </form>

      <p className="text-center text-sm text-fg-muted">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
