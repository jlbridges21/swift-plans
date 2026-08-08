"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { GoogleButton } from "@/components/auth/GoogleButton";
import {
  signIn,
  type AuthActionState,
} from "@/lib/auth/actions";

const initialState: AuthActionState = {};

type SignInFormProps = {
  initialError?: string;
};

export function SignInForm({ initialError }: SignInFormProps) {
  const [state, action] = useActionState(signIn, {
    ...initialState,
    error: initialError,
  });

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
          autoComplete="current-password"
          required
        />

        {state.error ? (
          <p className="text-sm text-danger" role="alert">
            {state.error}
          </p>
        ) : null}

        <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
      </form>

      <p className="text-center text-sm text-fg-muted">
        <Link
          href="/forgot-password"
          className="min-h-[var(--sp-touch-min)] inline-flex items-center text-accent hover:underline"
        >
          Forgot password?
        </Link>
      </p>

      <p className="text-center text-sm text-fg-muted">
        No account?{" "}
        <Link href="/sign-up" className="font-medium text-accent hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
