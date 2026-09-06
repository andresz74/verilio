import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

const controlClass =
  "min-h-10 w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] shadow-none transition-colors placeholder:text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-border-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-subtle)] disabled:cursor-not-allowed disabled:bg-[var(--color-bg-subtle)] disabled:text-[var(--color-text-muted)] aria-[invalid=true]:border-[var(--color-danger-default)] aria-[invalid=true]:ring-[var(--color-danger-subtle)]";

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className = "", ...props }, ref) {
    return <input ref={ref} className={`${controlClass} ${className}`} {...props} />;
  },
);

export const DateInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function DateInput(props, ref) {
    return <TextInput ref={ref} type="date" {...props} />;
  },
);

export const TimeInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function TimeInput(props, ref) {
    return <TextInput ref={ref} type="time" {...props} />;
  },
);

export const DurationInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function DurationInput(props, ref) {
    return <TextInput ref={ref} inputMode="text" placeholder="1:30 or 90m" {...props} />;
  },
);

export const TextArea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function TextArea({ className = "", rows = 4, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={`${controlClass} resize-y ${className}`}
      {...props}
    />
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = "", ...props }, ref) {
    return <select ref={ref} className={`${controlClass} ${className}`} {...props} />;
  },
);

export type FieldProps = {
  children: ReactNode;
  error?: string | undefined;
  hint?: string | undefined;
  htmlFor: string;
  label: string;
  required?: boolean;
};

export function Field({ children, error, hint, htmlFor, label, required }: FieldProps) {
  return (
    <div className="grid gap-1.5">
      <label className="text-sm font-medium text-[var(--color-text-primary)]" htmlFor={htmlFor}>
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-1 text-[var(--color-danger-default)]">
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? <FormError id={`${htmlFor}-error`}>{error}</FormError> : null}
      {!error && hint ? (
        <p id={`${htmlFor}-hint`} className="m-0 text-xs text-[var(--color-text-muted)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function FormError({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p id={id} role="alert" className="m-0 text-xs text-[var(--color-danger-default)]">
      {children}
    </p>
  );
}

export function InlineError({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-[var(--radius-md)] border border-[var(--color-danger-default)] bg-[var(--color-danger-subtle)] px-4 py-3 text-sm text-[var(--color-danger-default)]"
    >
      {children}
    </div>
  );
}
