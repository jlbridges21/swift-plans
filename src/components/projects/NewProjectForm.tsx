"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  createProject,
  type ProjectActionState,
} from "@/lib/projects/actions";

const initial: ProjectActionState = {};

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending ? "Creating…" : label}
    </Button>
  );
}

type NewProjectFormProps = {
  compact?: boolean;
};

export function NewProjectForm({ compact = false }: NewProjectFormProps) {
  const [state, action] = useActionState(createProject, initial);

  return (
    <form action={action} className="flex w-full flex-col gap-4">
      <Input
        label="Name or address"
        name="name"
        placeholder="123 Oak Street"
        required
        autoComplete="off"
      />
      {state.error ? (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
      <Submit label={compact ? "Create" : "New Floor Plan"} />
    </form>
  );
}
