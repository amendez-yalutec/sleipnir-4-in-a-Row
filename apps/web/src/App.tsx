/** Pantallas "Nueva partida" y "Partida" (PLAN_FRONTEND.md §4) y el panel "Mi equipo". */
import { useEffect, useMemo, useState } from 'react';
import type { ArbiterClient } from './arbiter/client.ts';
import type { ArbiterConfig } from './arbiter/config.ts';
import type { ApiClient } from './api/types.ts';
import { BotInsights } from './components/BotInsights.tsx';
import { Board } from './components/Board.tsx';
import { GameStatus } from './components/GameStatus.tsx';
import { Header } from './components/Header.tsx';
import { MoveHistory } from './components/MoveHistory.tsx';
import { SetupPanel } from './components/SetupPanel.tsx';
import { TeamPanel } from './components/TeamPanel.tsx';
import { canUndo, humanPlayer } from './game/reducer.ts';
import { useBotStatus } from './game/useBotStatus.ts';
import { useGame } from './game/useGame.ts';
import { Button } from './ui/button.tsx';
import { Card } from './ui/card.tsx';
import { cn } from './ui/cn.ts';

type View = 'play' | 'team';
const viewFromHash = (): View => (location.hash === '#equipo' ? 'team' : 'play');

/** Pestaña activa según el hash de la URL (`#equipo`), para poder enlazarla y usar "atrás". */
function useView(): View {
  const [view, setView] = useState<View>(viewFromHash);
  useEffect(() => {
    const onChange = () => setView(viewFromHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return view;
}

function Tabs({ view }: { readonly view: View }) {
  const tab = (target: View, href: string, label: string) => (
    <a
      href={href}
      aria-current={view === target ? 'page' : undefined}
      className={cn(
        'border-b-4 px-1 py-3 font-semibold focus-visible:ring-4 focus-visible:ring-halo focus-visible:outline-none',
        view === target ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink',
      )}
    >
      {label}
    </a>
  );
  return (
    <nav aria-label="Secciones" className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-5xl gap-6 px-4">
        {tab('play', '#', 'Jugar')}
        {tab('team', '#equipo', 'Mi equipo')}
      </div>
    </nav>
  );
}

export interface AppProps {
  readonly client: ApiClient;
  /** Valor de `?moves=` (columnas 0–7 separadas por coma). */
  readonly initialMoves?: string | null;
  /** Solo para pruebas: cliente del árbitro falso para el panel "Mi equipo". */
  readonly makeArbiterClient?: (config: ArbiterConfig) => ArbiterClient;
}

export function App({ client, initialMoves = null, makeArbiterClient }: AppProps) {
  const view = useView();
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
      <Tabs view={view} />
      <main className="mx-auto max-w-5xl px-4 py-6">
        {view === 'team' ? (
          <TeamPanel {...(makeArbiterClient && { makeClient: makeArbiterClient })} />
        ) : state.phase === 'setup' ? (
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
