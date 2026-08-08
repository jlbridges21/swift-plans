"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signInWithGoogle, type AuthActionState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/Button";

type GoogleButtonProps = {
  label: string;
};

const initialState: AuthActionState = {};

function GoogleSubmit({ label }: GoogleButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant="secondary"
      className="w-full"
      disabled={pending}
      aria-disabled={pending}
    >
      {pending ? "Redirecting…" : label}
    </Button>
  );
}

export function GoogleButton({ label }: GoogleButtonProps) {
  const [state, action] = useActionState(signInWithGoogle, initialState);

  return (
    <div className="flex flex-col gap-2">
      <form action={action}>
        <GoogleSubmit label={label} />
      </form>
      {state.error ? (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
