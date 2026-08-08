"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  deleteProject,
  renameProject,
  type ProjectActionState,
} from "@/lib/projects/actions";

const initial: ProjectActionState = {};

function PendingSubmit({
  label,
  pendingLabel,
  variant = "primary",
}: {
  label: string;
  pendingLabel: string;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

type ProjectManageProps = {
  projectId: string;
  name: string;
};

export function RenameProjectForm({ projectId, name }: ProjectManageProps) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(renameProject, initial);

  if (!open) {
    return (
      <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
        Rename
      </Button>
    );
  }

  return (
    <form action={action} className="flex w-full flex-col gap-3 sm:max-w-sm">
      <input type="hidden" name="projectId" value={projectId} />
      <Input label="Name or address" name="name" defaultValue={name} required />
      {state.error ? (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <PendingSubmit label="Save" pendingLabel="Saving…" />
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function DeleteProjectForm({ projectId, name }: ProjectManageProps) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(deleteProject, initial);

  if (!open) {
    return (
      <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
        Delete
      </Button>
    );
  }

  return (
    <form action={action} className="flex w-full flex-col gap-3 sm:max-w-sm">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="expectedName" value={name} />
      <p className="text-sm text-fg-muted">
        Permanently delete <span className="font-medium text-navy">{name}</span>?
        Type the name to confirm.
      </p>
      <Input label="Confirm name" name="confirmName" required autoComplete="off" />
      {state.error ? (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <PendingSubmit
          label="Delete forever"
          pendingLabel="Deleting…"
          variant="secondary"
        />
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
