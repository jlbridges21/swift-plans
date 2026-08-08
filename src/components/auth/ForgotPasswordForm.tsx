"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { SubmitButton } from "@/components/auth/SubmitButton";
import {
  forgotPassword,
  type AuthActionState,
} from "@/lib/auth/actions";

const initialState: AuthActionState = {};

export function ForgotPasswordForm() {
  const [state, action] = useActionState(forgotPassword, initialState);

  if (state.success) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <p className="text-base font-medium text-foreground">Check your email</p>
        <p className="text-sm leading-relaxed text-fg-muted">{state.success}</p>
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
    <form action={action} className="flex flex-col gap-4">
      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
      />

      {state.error ? (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      ) : null}

      <SubmitButton pendingLabel="Sending…">Send reset link</SubmitButton>

      <p className="text-center text-sm text-fg-muted">
        <Link
          href="/sign-in"
          className="inline-flex min-h-[var(--sp-touch-min)] items-center text-accent hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
