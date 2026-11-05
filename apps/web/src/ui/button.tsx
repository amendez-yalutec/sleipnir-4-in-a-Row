/**
 * Botón al estilo shadcn/ui con las medidas del migo Design System (Primary y Secondary button,
 * tamaño Large: 48 px de alto, radio 16). Zona táctil ≥ 44 px.
 *
 * Accesibilidad: el azul de acción (#0076FF) con blanco da 4.17:1, que no llega a AA (4.5:1) para
 * texto normal. Para respetar los colores del sistema y cumplir AA, el texto va a 20 px en negrita:
 * WCAG lo considera texto grande (mínimo 3:1). Lo verifica axe en las pruebas E2E.
 */
import { type VariantProps, cva } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from './cn.ts';

const buttonVariants = cva(
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-control border px-4 text-xl font-bold motion-safe:transition-colors focus-visible:ring-4 focus-visible:ring-halo disabled:cursor-not-allowed disabled:border-disabled disabled:bg-disabled disabled:text-disabled-ink',
  {
    variants: {
      variant: {
        // Primary button: Action/default → hover → pressed.
        primary:
          'border-accent bg-accent text-surface hover:border-accent-hover hover:bg-accent-hover active:border-accent-pressed active:bg-accent-pressed',
        // Secondary button: contorno de acción sobre la superficie.
        secondary:
          'border-accent bg-surface text-accent hover:bg-page active:border-accent-pressed active:text-accent-pressed',
      },
    },
    defaultVariants: { variant: 'primary' },
  },
);

export type ButtonProps = ComponentProps<'button'> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant }), className)} {...props} />;
}
