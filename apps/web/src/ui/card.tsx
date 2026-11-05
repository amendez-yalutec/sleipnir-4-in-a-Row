/** Tarjeta al estilo shadcn/ui: panel del migo Design System (radius/lg, sombra suave, sin borde). */
import type { ComponentProps } from 'react';
import { cn } from './cn.ts';

export function Card({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section className={cn('rounded-panel bg-surface p-4 shadow-card', className)} {...props} />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<'h2'>) {
  return <h2 className={cn('mb-2 text-sm font-semibold text-muted', className)} {...props} />;
}
