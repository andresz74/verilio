import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

import { IconButton } from "./icon-button.js";

export type DialogProps = {
  children: ReactNode;
  description?: string | undefined;
  footer?: ReactNode;
  onOpenChange?: ((open: boolean) => void) | undefined;
  open?: boolean | undefined;
  title: string;
  trigger?: ReactNode;
};

export function Dialog({
  children,
  description,
  footer,
  onOpenChange,
  open,
  title,
  trigger,
}: DialogProps) {
  return (
    <DialogPrimitive.Root
      {...(open === undefined ? {} : { open })}
      {...(onOpenChange === undefined ? {} : { onOpenChange })}
    >
      {trigger ? <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger> : null}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[var(--color-overlay)] data-[state=closed]:animate-out data-[state=open]:animate-in" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 grid max-h-[85vh] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 gap-5 overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] p-6 shadow-[var(--shadow-elevated)] focus:outline-none">
          <div className="pr-10">
            <DialogPrimitive.Title className="m-0 text-lg font-semibold text-[var(--color-text-primary)]">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mb-0 mt-2 text-sm text-[var(--color-text-secondary)]">
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>
          <DialogPrimitive.Close asChild>
            <IconButton aria-label="Close dialog" className="absolute right-4 top-4">
              <X aria-hidden="true" size={18} />
            </IconButton>
          </DialogPrimitive.Close>
          <div>{children}</div>
          {footer ? <div className="flex justify-end gap-3">{footer}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export const DialogClose = DialogPrimitive.Close;
