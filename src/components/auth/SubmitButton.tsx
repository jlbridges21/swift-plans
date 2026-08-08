"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/Button";

type SubmitButtonProps = {
  children: React.ReactNode;
  pendingLabel: string;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
};

/**
 * Form submit control that disables itself while the Server Action is pending.
 */
export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  className = "w-full",
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant={variant}
      className={className}
      disabled={pending}
      aria-disabled={pending}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}
