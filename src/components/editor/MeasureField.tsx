"use client";

import { useId } from "react";
import { formatMeasure, parseMeasure } from "@/lib/measure";

type MeasureFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSettled?: () => void;
  autoFocus?: boolean;
};

/**
 * Measurement text field with live interpreted echo (= 12' 6").
 * Uses decimal keypad on mobile.
 */
export function MeasureField({
  label,
  value,
  onChange,
  onSettled,
  autoFocus,
}: MeasureFieldProps) {
  const id = useId();
  const parsed = parseMeasure(value);
  const echo = value.trim()
    ? parsed.ok
      ? `= ${formatMeasure(parsed.inches)}`
      : parsed.error
    : undefined;

  return (
    <label className="flex w-full flex-col gap-1.5 text-sm" htmlFor={id}>
      <span className="font-medium text-navy">{label}</span>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => onSettled?.()}
        autoFocus={autoFocus}
        inputMode="decimal"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder={`e.g. 12' 6"`}
        aria-invalid={value.trim() && !parsed.ok ? true : undefined}
        className={[
          "min-h-[var(--sp-touch-min)] w-full rounded-sm border bg-elevated",
          "px-3 text-base text-foreground placeholder:text-fg-subtle",
          "transition-colors hover:border-border-strong",
          value.trim() && !parsed.ok ? "border-danger" : "border-border",
        ].join(" ")}
      />
      {echo ? (
        <span
          className={
            parsed.ok ? "text-xs text-fg-muted" : "text-xs text-danger"
          }
          aria-live="polite"
        >
          {echo}
        </span>
      ) : (
        <span className="text-xs text-fg-subtle">Feet and inches</span>
      )}
    </label>
  );
}
