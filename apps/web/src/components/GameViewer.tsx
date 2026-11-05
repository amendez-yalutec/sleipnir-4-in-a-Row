/**
 * Tablero de una partida del equipo en el árbitro, en vivo: se vuelve a pedir cada 1.5 s mientras se
 * juega. Reutiliza `Board` en modo solo lectura: nuestro bot con fichas blancas (como en la app) y el
 * rival con fichas doradas. Los nombres de los equipos son texto no confiable (solo texto).
 */
import type { GameState } from '@equipo6/contracts';
import { useEffect, useRef, useState } from 'react';
import { type ArbiterClient, ArbiterError } from '../arbiter/client.ts';
import type { GameDetail } from '../arbiter/schema.ts';
import { Button } from '../ui/button.tsx';
import { Card } from '../ui/card.tsx';
import { Board } from './Board.tsx';

export const GAME_POLL_MS = 1_500;

const REASONS: Readonly<Record<string, string>> = {
  connect4: 'cuatro en línea',
  draw: 'empate',
  illegal_move: 'jugada ilegal',
  timeout: 'tiempo',
  absent: 'ausencia',
  admin: 'decisión del árbitro',
};

/** Convierte la partida del árbitro al estado que dibuja `Board` (sin jugadas posibles). */
export function toBoardState(game: GameDetail): GameState {
  const result = game.result ?? null;
  const toMove = game.current ?? (game.moves.length % 2 === 0 ? 1 : 2);
  return {
    moves: game.moves.map((move) => move.column),
    board: game.board.map((row) => row.map((cell) => (cell === 1 ? 1 : cell === 2 ? 2 : 0))),
    toMove,
    legalMoves: [],
    status: !result ? 'playing' : result.winner === null ? 'draw' : 'won',
    winner: result?.winner ?? null,
    winningCells: result?.winning_cells ?? [],
  };
}

/** Qué jugador (1 o 2) es nuestro equipo en la partida; 1 si no aparece. */
export function ourSeat(game: GameDetail, teamId: string): 1 | 2 {
  return game.players['2'].team_id === teamId ? 2 : 1;
}

export function describeGame(game: GameDetail, us: 1 | 2): string {
  const result = game.result ?? null;
  if (!result) {
    if (game.status === 'scheduled') return 'Programada';
    return game.current === us ? 'Turno de nuestro bot' : 'Turno del rival';
  }
  if (result.winner === null) return 'Empate';
  const reason = REASONS[result.reason] ?? result.reason;
  return `${result.winner === us ? 'Ganamos' : 'Perdimos'} por ${reason}`;
}

export interface GameViewerProps {
  readonly client: ArbiterClient;
  readonly gameId: string;
  readonly teamId: string;
  readonly onClose: () => void;
  /** Se llama cuando una partida que se estaba viendo en curso termina (para refrescar el panel). */
  readonly onFinished?: () => void;
}

export function GameViewer({ client, gameId, teamId, onClose, onFinished }: GameViewerProps) {
  const [game, setGame] = useState<GameDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const finished = useRef(onFinished);
  useEffect(() => {
    finished.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    let active = true;
    let sawPlaying = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () =>
      void client.game(gameId).then(
        (next) => {
          if (!active) return;
          setGame(next);
          setError(null);
          if (!next.result) {
            sawPlaying = true;
            timer = setTimeout(load, GAME_POLL_MS);
          } else if (sawPlaying) finished.current?.();
        },
        (reason: unknown) => {
          if (!active) return;
          setError(
            reason instanceof ArbiterError ? reason.message : 'No se pudo cargar la partida.',
          );
          timer = setTimeout(load, GAME_POLL_MS * 2);
        },
      );
    load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [client, gameId]);

  const us = game ? ourSeat(game, teamId) : 1;
  const rival = us === 1 ? 2 : 1;

  return (
    <Card className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Partida {gameId}</h2>
        <Button variant="secondary" onClick={onClose}>
          Cerrar
        </Button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {game && (
        <>
          <p role="status" className="text-sm">
            <span className="font-semibold">{describeGame(game, us)}</span>
            <span className="text-muted"> · jugada {game.moves.length}</span>
          </p>
          <p className="text-sm text-muted">
            Blancas: {game.players[us === 1 ? '1' : '2'].name} (nuestro bot) · Doradas:{' '}
            {game.players[rival === 1 ? '1' : '2'].name}
          </p>
          <Board game={toBoardState(game)} human={rival} interactive={false} onPlay={() => {}} />
        </>
      )}
    </Card>
  );
}
