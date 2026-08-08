"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { SubmitButton } from "@/components/auth/SubmitButton";
import {
  resetPassword,
  type AuthActionState,
} from "@/lib/auth/actions";

const initialState: AuthActionState = {};

type ResetPasswordFormProps = {
  hasSession: boolean;
};

export function ResetPasswordForm({ hasSession }: ResetPasswordFormProps) {
  const [state, action] = useActionState(resetPassword, initialState);

  if (!hasSession) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <p className="text-base font-medium text-foreground">
          Link expired or invalid
        </p>
        <p className="text-sm leading-relaxed text-fg-muted">
          This reset link has expired or is no longer valid. Request a new one
          to continue.
        </p>
        <Link
          href="/forgot-password"
          className="inline-flex min-h-[var(--sp-touch-min)] items-center justify-center text-sm font-medium text-accent hover:underline"
        >
          Request a new reset link
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <Input
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters"
        required
      />
      <Input
        label="Confirm new password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
      />

      {state.error ? (
        <p className="text-sm text-danger" role="alert">
          {state.error}
          {state.error.toLowerCase().includes("expired") ||
          state.error.toLowerCase().includes("no longer valid") ? (
            <>
              {" "}
              <Link href="/forgot-password" className="underline">
                Request a new link
              </Link>
            </>
          ) : null}
        </p>
      ) : null}

      <SubmitButton pendingLabel="Updating…">Update password</SubmitButton>
    </form>
  );
}
