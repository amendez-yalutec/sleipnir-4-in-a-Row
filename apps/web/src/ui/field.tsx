/**
 * Campo de texto al estilo shadcn/ui (Label + Input) con los tokens del migo Design System: alto de
 * 48 px como el botón Large, borde Border/Default y halo de foco. El error se anuncia con
 * `aria-describedby` y `aria-invalid`.
 */
import { type ComponentProps, useId } from 'react';
import { cn } from './cn.ts';

export interface FieldProps extends Omit<ComponentProps<'input'>, 'id'> {
  readonly label: string;
  readonly hint?: string;
  readonly error?: string | undefined;
}

export function Field({ label, hint, error, className, ...props }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          'min-h-12 w-full rounded-control border bg-surface px-4 text-base focus-visible:ring-4 focus-visible:ring-halo focus-visible:outline-none',
          error ? 'border-danger' : 'border-line-strong',
          className,
        )}
        {...props}
      />
      {error ? (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-xs text-muted">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
