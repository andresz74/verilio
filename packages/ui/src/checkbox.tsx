import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";

export type CheckboxProps = ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>;

export const Checkbox = forwardRef<
  ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(function Checkbox({ className = "", ...props }, ref) {
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      className={`inline-flex size-5 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] text-[var(--color-text-inverse)] transition-colors hover:border-[var(--color-accent-default)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)] data-[state=checked]:border-[var(--color-accent-default)] data-[state=checked]:bg-[var(--color-accent-default)] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        <Check aria-hidden="true" size={14} strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
});

