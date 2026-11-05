/** Nueva partida: quién empieza y dificultad (PLAN_FRONTEND.md §4.1). */
import type { Level } from '@equipo6/contracts';
import { Button } from '../ui/button.tsx';
import { Card } from '../ui/card.tsx';
import { cn } from '../ui/cn.ts';

const LEVEL_LABELS: Record<Level, { name: string; hint: string }> = {
  easy: { name: 'Fácil', hint: 'Piensa poco y a veces se distrae' },
  medium: { name: 'Medio', hint: 'Piensa un instante' },
  hard: { name: 'Difícil', hint: 'El mismo bot del torneo' },
};

interface Option<T> {
  readonly value: T;
  readonly label: string;
  readonly hint?: string;
}

function Choice<T extends string>(props: {
  readonly legend: string;
  readonly name: string;
  readonly options: readonly Option<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 font-semibold">{props.legend}</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {props.options.map((option) => (
          <label
            key={option.value}
            className={cn(
              'flex min-h-12 cursor-pointer items-center gap-3 rounded-panel border px-4 py-3 has-focus-visible:ring-4 has-focus-visible:ring-halo',
              // Seleccionada: borde de acción doble sobre blanco (sobre el canvas, el texto
              // secundario no llega a AA).
              option.value === props.value
                ? 'border-accent bg-surface ring-1 ring-accent'
                : 'border-line bg-surface hover:border-line-strong',
            )}
          >
            <input
              type="radio"
              name={props.name}
              value={option.value}
              checked={option.value === props.value}
              onChange={() => props.onChange(option.value)}
              className="sr-only"
            />
            {/* Radio del sistema: anillo Control/border y punto Control/selected. */}
            <span
              aria-hidden
              className={cn(
                'grid size-5 shrink-0 place-items-center rounded-full border-2',
                option.value === props.value ? 'border-accent' : 'border-control',
              )}
            >
              {option.value === props.value && <span className="size-2.5 rounded-full bg-accent" />}
            </span>
            <span className="flex flex-col">
              <span className="font-semibold">{option.label}</span>
              {option.hint && <span className="text-xs text-muted">{option.hint}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export interface SetupPanelProps {
  readonly humanFirst: boolean;
  readonly level: Level;
  readonly onChange: (change: { humanFirst?: boolean; level?: Level }) => void;
  readonly onStart: () => void;
}

export function SetupPanel({ humanFirst, level, onChange, onStart }: SetupPanelProps) {
  return (
    <Card className="mx-auto max-w-xl space-y-6 rounded-card p-6 sm:p-8">
      <div>
        <h2 className="text-2xl font-semibold">Nueva partida</h2>
        <p className="text-sm text-muted">
          Alinea cuatro fichas en horizontal, vertical o diagonal antes que el bot.
        </p>
      </div>
      <Choice
        legend="¿Quién empieza?"
        name="first"
        value={humanFirst ? 'me' : 'bot'}
        options={[
          { value: 'me', label: 'Yo', hint: 'Tus fichas son doradas' },
          { value: 'bot', label: 'El bot', hint: 'Sus fichas son blancas' },
        ]}
        onChange={(value) => onChange({ humanFirst: value === 'me' })}
      />
      <Choice
        legend="Dificultad"
        name="level"
        value={level}
        options={(Object.keys(LEVEL_LABELS) as Level[]).map((value) => ({
          value,
          label: LEVEL_LABELS[value].name,
          hint: LEVEL_LABELS[value].hint,
        }))}
        onChange={(value) => onChange({ level: value })}
      />
      <Button className="w-full" onClick={onStart}>
        Jugar
      </Button>
    </Card>
  );
}
