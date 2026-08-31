import { forwardRef, type ButtonHTMLAttributes } from "react";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className = "", type = "button", variant = "primary", ...props },
  ref,
) {
  const variantClass =
    variant === "primary"
      ? "bg-[var(--color-accent-default)] text-white hover:bg-[var(--color-accent-hover)]"
      : "border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)]";

  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex min-h-10 items-center justify-center rounded-[var(--radius-md)] px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)] disabled:cursor-not-allowed disabled:opacity-50 ${variantClass} ${className}`}
      {...props}
    />
  );
});

