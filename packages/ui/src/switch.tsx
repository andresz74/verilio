import * as SwitchPrimitive from "@radix-ui/react-switch";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";

export type SwitchProps = ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>;

export const Switch = forwardRef<ElementRef<typeof SwitchPrimitive.Root>, SwitchProps>(
  function Switch({ className = "", ...props }, ref) {
    return (
      <SwitchPrimitive.Root
        ref={ref}
        className={`relative h-6 w-11 rounded-full bg-[var(--color-border-strong)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)] data-[state=checked]:bg-[var(--color-accent-default)] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        {...props}
      >
        <SwitchPrimitive.Thumb className="block size-5 translate-x-0.5 rounded-full bg-[var(--color-bg-surface)] shadow-sm transition-transform data-[state=checked]:translate-x-5" />
      </SwitchPrimitive.Root>
    );
  },
);

