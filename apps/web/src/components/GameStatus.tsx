/** Lo que pasa ahora: turno, bot pensando, resultado o error (región `aria-live`). */
import type { GameState } from '@equipo6/contracts';
import type { Notice, Phase } from '../game/reducer.ts';
import { Button } from '../ui/button.tsx';
import { cn } from '../ui/cn.ts';

export function headline(phase: Phase, game: GameState, human: 1 | 2): string {
  if (phase === 'finished') {
    if (game.status === 'draw') return 'Empate: el tablero se llenó.';
    return game.winner === human ? '¡Ganaste!' : 'Ganó el bot.';
  }
  if (phase === 'botThinking') return 'El bot está pensando…';
  if (phase === 'checking') return 'Colocando tu ficha…';
  if (phase === 'error') return 'Algo falló.';
  return 'Tu turno: elige una columna.';
}

/** Avisos con los colores de Feedback del sistema (info, alert, error). */
const TONE: Record<Notice['tone'], string> = {
  info: 'border-info/20 bg-info-soft text-info',
  warning: 'border-warning/20 bg-warning-soft text-warning',
  error: 'border-danger/20 bg-danger-soft text-danger',
};

export interface GameStatusProps {
  readonly phase: Phase;
  readonly game: GameState;
  readonly human: 1 | 2;
  readonly notice: Notice | null;
  readonly onRetry: () => void;
  readonly onPlayAgain: () => void;
}

/** Color del indicador: de quien juega ahora o de quien ganó; neutro en empate o error. */
function indicator(phase: Phase, game: GameState, human: 1 | 2): string {
  const humanDisc = 'bg-human ring-human-edge';
  const botDisc = 'bg-bot ring-bot-edge';
  if (phase === 'finished') {
    if (game.winner === null) return 'bg-line ring-line-strong';
    return game.winner === human ? humanDisc : botDisc;
  }
  if (phase === 'error') return 'bg-danger-dot ring-danger';
  return phase === 'botThinking' ? botDisc : humanDisc;
}

export function GameStatus({ phase, game, human, notice, onRetry, onPlayAgain }: GameStatusProps) {
  const thinking = phase === 'botThinking' || phase === 'checking';
  return (
    <div className="space-y-3">
      <div aria-live="polite" className="flex items-center gap-3">
        <span
          aria-hidden
          className={cn(
            'size-5 shrink-0 rounded-full ring-2 ring-inset',
            indicator(phase, game, human),
            thinking && 'motion-safe:animate-pulse',
          )}
        />
        <p className="text-xl font-semibold">{headline(phase, game, human)}</p>
      </div>
      {notice && (
        <p role="alert" className={cn('rounded-panel border px-4 py-3 text-sm', TONE[notice.tone])}>
          {notice.text}
        </p>
      )}
      {phase === 'error' && <Button onClick={onRetry}>Reintentar</Button>}
      {phase === 'finished' && <Button onClick={onPlayAgain}>Jugar otra vez</Button>}
    </div>
  );
}
