/** Historial: "1. Tú → columna 4". Se desplaza solo hasta la última jugada. */
import { useEffect, useRef } from 'react';
import { Card, CardTitle } from '../ui/card.tsx';
import { toDisplayColumn } from '../ui/coords.ts';

export interface MoveHistoryProps {
  readonly moves: readonly number[];
  readonly human: 1 | 2;
}

export function MoveHistory({ moves, human }: MoveHistoryProps) {
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [moves.length]);

  return (
    <Card>
      <CardTitle>Historial</CardTitle>
      {moves.length === 0 ? (
        <p className="text-sm text-muted">Todavía no hay jugadas.</p>
      ) : (
        <ol ref={list} className="max-h-48 space-y-0.5 overflow-y-auto text-sm">
          {moves.map((column, i) => {
            // El jugador 1 abre: las jugadas pares (0, 2, …) son suyas.
            const who = (i % 2 === 0 ? 1 : 2) === human ? 'Tú' : 'Bot';
            return (
              <li key={i}>
                {i + 1}. {who} → columna {toDisplayColumn(column)}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
