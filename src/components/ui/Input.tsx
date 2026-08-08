import type { InputHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
};

/**
 * Labeled text input. Minimum control height 44px for touch.
 */
export function Input({
  label,
  hint,
  error,
  id,
  className = "",
  ...props
}: InputProps) {
  const inputId = id ?? props.name;
  const describedBy = error
    ? `${inputId}-error`
    : hint
      ? `${inputId}-hint`
      : undefined;

  return (
    <label className="flex w-full flex-col gap-1.5 text-sm" htmlFor={inputId}>
      <span className="font-medium text-foreground">{label}</span>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={[
          "min-h-[var(--sp-touch-min)] w-full rounded-md border bg-elevated",
          "px-3 text-base text-foreground placeholder:text-fg-subtle",
          "transition-colors hover:border-border-strong",
          "disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70",
          error ? "border-danger" : "border-border",
          className,
        ].join(" ")}
        {...props}
      />
      {error ? (
        <span id={`${inputId}-error`} className="text-xs text-danger" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span id={`${inputId}-hint`} className="text-xs text-fg-muted">
          {hint}
        </span>
      ) : null}
    </label>
  );
}
