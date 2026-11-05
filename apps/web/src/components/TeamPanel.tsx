/** Pantalla "Mi equipo": conexión al árbitro, resumen del equipo, acciones y partidas recientes. */
import { useState } from 'react';
import type { ApiClient } from '../api/types.ts';
import type { ArbiterClient } from '../arbiter/client.ts';
import type { ArbiterConfig } from '../arbiter/config.ts';
import type { GameSummary } from '../arbiter/schema.ts';
import { useTeamPanel } from '../arbiter/useTeamPanel.ts';
import { Button } from '../ui/button.tsx';
import { Card, CardTitle } from '../ui/card.tsx';
import { cn } from '../ui/cn.ts';
import { ArbiterSettings } from './ArbiterSettings.tsx';
import { GameViewer } from './GameViewer.tsx';
import { TeamActions } from './TeamActions.tsx';
import { TournamentControl } from './TournamentControl.tsx';

const REASONS: Readonly<Record<string, string>> = {
  connect4: 'cuatro en línea',
  draw: 'empate',
  illegal_move: 'jugada ilegal',
  timeout: 'tiempo',
  absent: 'ausencia',
  admin: 'decisión del árbitro',
};

const KINDS: Readonly<Record<string, string>> = {
  practice: 'práctica',
  friendly: 'amistoso',
  league: 'liga',
  third_place: 'tercer puesto',
  final: 'final',
};

const PHASES: Readonly<Record<string, string>> = {
  practice: 'prácticas',
  frozen: 'congelado',
  league: 'liga',
  playoffs: 'playoffs',
  finished: 'terminado',
};

function outcome(game: GameSummary, teamId: string): string {
  if (!game.result) return game.status === 'scheduled' ? 'Programada' : 'En curso';
  if (game.result.winner === null) return 'Empate';
  const winner = game.players[game.result.winner === 1 ? '1' : '2'];
  const reason = REASONS[game.result.reason] ?? game.result.reason;
  return `${winner.team_id === teamId ? 'Ganamos' : 'Perdimos'} por ${reason}`;
}

function Stat({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-panel bg-subtle px-4 py-3">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

export interface TeamPanelProps {
  /** Nuestra API: inicia y detiene el bot del torneo de esta computadora. */
  readonly api: ApiClient;
  /** Solo para pruebas: cliente del árbitro falso. */
  readonly makeClient?: (config: ArbiterConfig) => ArbiterClient;
}

export function TeamPanel({ api, makeClient }: TeamPanelProps) {
  const { state, client, save, refresh, practice, submit } = useTeamPanel(makeClient);
  const { config, me, games, notice } = state;
  // Partida en el tablero, por prioridad: la que el equipo está jugando (salvo que la cierren); si
  // no, la que eligieron con "Ver tablero"; si no, la última que terminó en pantalla, para ver el
  // resultado. Una partida terminada nunca tapa a una en curso.
  const [chosen, setChosen] = useState<string | null>(null);
  const [finishedShown, setFinishedShown] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const live = games.find((game) => game.status === 'playing' && game.game_id !== dismissed);
  const shown = live?.game_id ?? chosen ?? finishedShown;

  return (
    <div className="space-y-6">
      <ArbiterSettings config={config} onSave={save} />
      <TournamentControl api={api} config={config} />

      {notice && (
        <p
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={cn(
            'rounded-panel px-4 py-3 text-sm',
            notice.tone === 'ok' ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger',
          )}
        >
          {notice.text}
        </p>
      )}

      {client && shown && (
        <GameViewer
          key={shown}
          client={client}
          gameId={shown}
          teamId={config.teamId}
          onClose={() => {
            setChosen(null);
            setFinishedShown(null);
            setDismissed(shown);
          }}
          onFinished={() => {
            // Se queda con el resultado hasta que aparezca otra partida en curso.
            if (chosen !== shown) setFinishedShown(shown);
            void refresh();
          }}
        />
      )}

      {config.url && (
        <Card className="space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-semibold">{me ? me.team.name : 'Mi equipo'}</h2>
            <Button variant="secondary" disabled={state.loading} onClick={() => void refresh()}>
              {state.loading ? 'Actualizando…' : 'Actualizar'}
            </Button>
          </div>
          <p className="text-sm text-muted">
            {state.connected === false
              ? 'Sin conexión con el árbitro.'
              : `Árbitro en línea${state.phase ? ` · fase: ${PHASES[state.phase] ?? state.phase}` : ''}`}
          </p>
          {me && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Posición" value={me.standing ? `${me.standing.position}.º` : '—'} />
              <Stat label="Puntos" value={me.standing ? String(me.standing.points) : '—'} />
              <Stat label="Turnos pendientes" value={String(me.pending_turns?.length ?? 0)} />
              <Stat
                label="Entrega"
                value={me.submission ? me.submission.commit.slice(0, 7) : '—'}
              />
            </div>
          )}
          {!config.token && (
            <p className="text-sm text-muted">Agrega el token para ver la posición y la entrega.</p>
          )}
        </Card>
      )}

      {me && (
        <TeamActions
          open={state.phase === 'practice'}
          onPractice={(opponent, first) => {
            // La práctica nueva pasa al tablero en cuanto aparece en la lista.
            setChosen(null);
            setFinishedShown(null);
            void practice(opponent, first);
          }}
          onSubmit={(repoUrl, commit) => void submit(repoUrl, commit)}
        />
      )}

      {config.teamId && config.url && (
        <Card className="p-6">
          <CardTitle>Partidas del equipo</CardTitle>
          {games.length === 0 ? (
            <p className="text-sm text-muted">Todavía no hay partidas de {config.teamId}.</p>
          ) : (
            <>
              {live && (
                <p className="mb-2 text-xs text-muted">
                  Hay una partida en curso: el tablero muestra esa. Ciérrala para ver otra.
                </p>
              )}
              <ul className="divide-y divide-line">
                {games.slice(0, 20).map((game) => {
                  const viewing = game.game_id === shown;
                  const blocked = live !== undefined && game.game_id !== live.game_id;
                  return (
                    <li
                      key={game.game_id}
                      className={cn(
                        'flex flex-wrap items-center justify-between gap-2 rounded-control px-2 py-2 text-sm',
                        viewing && 'bg-subtle',
                      )}
                    >
                      <span>
                        {game.players['1'].name} vs {game.players['2'].name}
                        <span className="text-muted"> · {KINDS[game.kind] ?? game.kind}</span>
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="text-muted">{outcome(game, config.teamId)}</span>
                        <Button
                          variant="secondary"
                          className="min-h-9 px-3 text-sm"
                          aria-label={`Ver tablero de ${game.game_id}`}
                          aria-pressed={viewing}
                          disabled={viewing || blocked}
                          onClick={() => {
                            setChosen(game.game_id);
                            setFinishedShown(null);
                          }}
                        >
                          {viewing ? 'Viendo' : 'Ver tablero'}
                        </Button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
