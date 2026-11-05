/** "Cómo pensó el bot": profundidad, posiciones, tiempo y su evaluación en palabras. */
import type { BotInsight } from '@equipo6/contracts';
import { Card, CardTitle } from '../ui/card.tsx';
import { toDisplayColumn } from '../ui/coords.ts';

/** El puntaje es desde el punto de vista del bot: ±1000 es victoria o derrota demostrada. */
export function verdict(score: number): string {
  if (score >= 900) return 'Ya vio cómo ganar.';
  if (score <= -900) return 'Sabe que va a perder.';
  if (score > 40) return 'Cree que va ganando.';
  if (score < -40) return 'Cree que vas ganando tú.';
  return 'Lo ve parejo.';
}

export function BotInsights({ insight }: { readonly insight: BotInsight | null }) {
  return (
    <Card>
      <CardTitle>Cómo pensó el bot</CardTitle>
      {insight ? (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted">Jugó en</dt>
          <dd className="font-semibold">columna {toDisplayColumn(insight.column)}</dd>
          <dt className="text-muted">Profundidad</dt>
          <dd className="font-semibold">
            {insight.depth} {insight.depth === 1 ? 'jugada' : 'jugadas'}
          </dd>
          <dt className="text-muted">Posiciones</dt>
          <dd className="font-semibold">{insight.nodes.toLocaleString('es-GT')}</dd>
          <dt className="text-muted">Tiempo</dt>
          <dd className="font-semibold">{(insight.ms / 1000).toFixed(2)} s</dd>
          <dd className="col-span-2 mt-1 font-semibold">{verdict(insight.score)}</dd>
        </dl>
      ) : (
        <p className="text-sm text-muted">Aparece cuando el bot juega.</p>
      )}
    </Card>
  );
}
