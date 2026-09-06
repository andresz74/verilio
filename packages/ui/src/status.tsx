import type { HTMLAttributes, ReactNode } from "react";

export type StatusBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "accent" | "success" | "warning" | "danger" | "info";
};

export function StatusBadge({
  className = "",
  tone = "neutral",
  ...props
}: StatusBadgeProps) {
  const tones = {
    neutral: "bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]",
    accent: "bg-[var(--color-accent-subtle)] text-[var(--color-accent-active)]",
    success: "bg-[var(--color-success-subtle)] text-[var(--color-success-default)]",
    warning: "bg-[var(--color-warning-subtle)] text-[var(--color-warning-default)]",
    danger: "bg-[var(--color-danger-subtle)] text-[var(--color-danger-default)]",
    info: "bg-[var(--color-info-subtle)] text-[var(--color-info-default)]",
  } satisfies Record<NonNullable<StatusBadgeProps["tone"]>, string>;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]} ${className}`}
      {...props}
    />
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
      <span
        aria-hidden="true"
        className="size-4 animate-spin rounded-full border-2 border-[var(--color-border-default)] border-t-[var(--color-accent-default)] motion-reduce:animate-none"
      />
      <span>{label}</span>
    </span>
  );
}

export function EmptyState({
  action,
  description,
  title,
}: {
  action?: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <div className="py-5 text-center">
      <h3 className="m-0 text-sm font-semibold text-[var(--color-text-primary)]">{title}</h3>
      <p className="mx-auto mb-0 mt-1 max-w-md text-sm text-[var(--color-text-secondary)]">
        {description}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
