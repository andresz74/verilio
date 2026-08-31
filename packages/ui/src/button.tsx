import { forwardRef, type ButtonHTMLAttributes } from "react";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet" | "danger";
  size?: "sm" | "md";
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className = "", size = "md", type = "button", variant = "primary", ...props },
  ref,
) {
  const variants = {
    primary:
      "bg-[var(--color-accent-default)] text-[var(--color-text-inverse)] hover:bg-[var(--color-accent-hover)] active:bg-[var(--color-accent-active)]",
    secondary:
      "border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)]",
    quiet:
      "bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-primary)]",
    danger:
      "bg-[var(--color-danger-default)] text-[var(--color-text-inverse)] hover:bg-[var(--color-danger-hover)]",
  } satisfies Record<NonNullable<ButtonProps["variant"]>, string>;
  const sizes = {
    sm: "min-h-9 px-3 py-1.5",
    md: "min-h-10 px-4 py-2",
  } satisfies Record<NonNullable<ButtonProps["size"]>, string>;

  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)] disabled:cursor-not-allowed disabled:opacity-50 ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    />
  );
});
