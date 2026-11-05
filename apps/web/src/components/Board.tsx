/**
 * Tablero 8×7 a medida (PLAN_FRONTEND.md §8). Recibe el tablero tal como lo da la API
 * (`board[fila][columna]`, fila 0 abajo); el orden en pantalla sale de `ui/coords.ts`.
 * Cada columna es un `<button>` con su `aria-label`.
 */
import type { GameState } from '@equipo6/contracts';
import { cn } from '../ui/cn.ts';
import { API_COLUMNS, SCREEN_ROWS, freeSpaces, toDisplayColumn, topRow } from '../ui/coords.ts';

export type Owner = 'human' | 'bot';

export interface BoardProps {
  readonly game: GameState;
  /** Jugador (1 o 2) que es la persona: decide el color de cada ficha. */
  readonly human: 1 | 2;
  /** La persona puede jugar ahora. */
  readonly interactive: boolean;
  /** Columna que la API está confirmando. */
  readonly pendingColumn?: number | null;
  readonly onPlay: (column: number) => void;
}

/** La ficha de la persona lleva además un anillo interior: se distingue por forma, no solo por color. */
const DISC: Record<Owner, string> = {
  human:
    'bg-human ring-human-edge after:absolute after:inset-1/4 after:rounded-full after:ring-2 after:ring-human-edge/60',
  bot: 'bg-bot ring-bot-edge',
};

export function Board({ game, human, interactive, pendingColumn = null, onPlay }: BoardProps) {
  const winning = new Set(game.winningCells.map(([row, column]) => `${row}:${column}`));
  const finished = game.status !== 'playing';
  const lastColumn = game.moves.at(-1);
  const lastRow = lastColumn === undefined ? null : topRow(game.board, lastColumn);
  const owner = (cell: number): Owner | null => {
    if (cell === 0) return null;
    return cell === human ? 'human' : 'bot';
  };

  return (
    <div className="mx-auto w-full max-w-[min(100%,calc(70vh*8/7))]">
      <div
        role="group"
        aria-label="Tablero de 8 columnas por 7 filas"
        className="grid aspect-[8/7] grid-cols-8 gap-1 rounded-board bg-board p-2 shadow-board sm:gap-2 sm:p-3"
      >
        {API_COLUMNS.map((column) => {
          const free = freeSpaces(game.board, column);
          const playable = game.legalMoves.includes(column);
          const label =
            `Columna ${toDisplayColumn(column)}, ` +
            (free === 0 ? 'llena' : `quedan ${free} ${free === 1 ? 'espacio' : 'espacios'}`);
          return (
            <button
              key={column}
              type="button"
              aria-label={label}
              aria-disabled={!interactive || !playable}
              data-column={column}
              onClick={() => onPlay(column)}
              className={cn(
                'group grid grid-rows-7 gap-1 rounded-xl p-0.5 sm:gap-2',
                interactive && playable && 'cursor-pointer hover:bg-hole/60',
                (!interactive || !playable) && 'cursor-default',
                pendingColumn === column && 'bg-hole/80',
              )}
            >
              {SCREEN_ROWS.map((row) => {
                const who = owner(game.board[row]?.[column] ?? 0);
                const isWinning = winning.has(`${row}:${column}`);
                const isLast = row === lastRow && column === lastColumn;
                return (
                  <span
                    key={row}
                    data-cell={`${row}:${column}`}
                    data-owner={who ?? 'empty'}
                    className="relative aspect-square rounded-full bg-hole shadow-inner"
                  >
                    {who && (
                      <span
                        className={cn(
                          'absolute inset-0 rounded-full ring-2 ring-inset',
                          DISC[who],
                          isLast && 'motion-safe:animate-drop',
                          isWinning && 'ring-4 ring-highlight motion-safe:animate-win',
                          finished && !isWinning && winning.size > 0 && 'opacity-40',
                        )}
                      />
                    )}
                  </span>
                );
              })}
            </button>
          );
        })}
      </div>
      <ol aria-hidden className="mt-2 grid grid-cols-8 text-center text-sm font-semibold text-ink">
        {API_COLUMNS.map((column) => (
          <li key={column}>{toDisplayColumn(column)}</li>
        ))}
      </ol>
    </div>
  );
}
