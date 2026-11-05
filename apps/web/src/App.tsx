/** Pantallas "Nueva partida" y "Partida" (PLAN_FRONTEND.md §4). */
import { useMemo } from 'react';
import type { ApiClient } from './api/types.ts';
import { BotInsights } from './components/BotInsights.tsx';
import { Board } from './components/Board.tsx';
import { GameStatus } from './components/GameStatus.tsx';
import { Header } from './components/Header.tsx';
import { MoveHistory } from './components/MoveHistory.tsx';
import { SetupPanel } from './components/SetupPanel.tsx';
import { canUndo, humanPlayer } from './game/reducer.ts';
import { useBotStatus } from './game/useBotStatus.ts';
import { useGame } from './game/useGame.ts';
import { Button } from './ui/button.tsx';
import { Card } from './ui/card.tsx';

export interface AppProps {
  readonly client: ApiClient;
  /** Valor de `?moves=` (columnas 0–7 separadas por coma). */
  readonly initialMoves?: string | null;
}

export function App({ client, initialMoves = null }: AppProps) {
  const status = useBotStatus(client);
  const { state, game, send } = useGame(client, initialMoves);
  const human = humanPlayer(state);
  const board = useMemo(
    () => (
      <Board
        game={game}
        human={human}
        interactive={state.phase === 'humanTurn'}
        pendingColumn={state.pendingColumn}
        onPlay={(column) => send({ type: 'columnClicked', column })}
      />
    ),
    [game, human, state.phase, state.pendingColumn, send],
  );

  return (
    <div className="min-h-screen">
      <Header status={status} />
      <main className="mx-auto max-w-5xl px-4 py-6">
        {state.phase === 'setup' ? (
          <SetupPanel
            humanFirst={state.humanFirst}
            level={state.level}
            onChange={(change) => send({ type: 'configure', ...change })}
            onStart={() => send({ type: 'start' })}
          />
        ) : (
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_18rem]">
            <div>{board}</div>
            <aside className="space-y-4">
              <Card>
                <GameStatus
                  phase={state.phase}
                  game={game}
                  human={human}
                  notice={state.notice}
                  onRetry={() => send({ type: 'retry' })}
                  onPlayAgain={() => send({ type: 'playAgain' })}
                />
              </Card>
              <BotInsights insight={state.insight} />
              <MoveHistory moves={game.moves} human={human} />
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  disabled={!canUndo(state)}
                  onClick={() => send({ type: 'undo' })}
                >
                  Deshacer
                </Button>
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => send({ type: 'reset' })}
                >
                  Reiniciar
                </Button>
              </div>
              <p className="text-xs text-ink">Atajo: teclas 1 a 8 para elegir columna.</p>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
