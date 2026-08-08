import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-fg hover:bg-accent-hover disabled:bg-accent/50",
  secondary:
    "border border-accent bg-transparent text-accent hover:bg-tinted disabled:opacity-50",
  ghost:
    "bg-transparent text-foreground hover:bg-tinted disabled:opacity-50",
};

/**
 * Shared button. Minimum height 48px for comfortable touch targets.
 */
export function Button({
  children,
  className = "",
  variant = "primary",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={[
        "inline-flex min-h-[var(--sp-touch-min)] items-center justify-center gap-2",
        "rounded-sm px-4 text-sm font-medium transition-colors",
        "disabled:cursor-not-allowed",
        variantClasses[variant],
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}
