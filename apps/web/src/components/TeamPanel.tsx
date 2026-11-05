/** Pantalla "Mi equipo": conexión al árbitro, resumen del equipo, acciones y partidas recientes. */
import type { ApiClient } from '../api/types.ts';
import type { ArbiterClient } from '../arbiter/client.ts';
import type { ArbiterConfig } from '../arbiter/config.ts';
import type { GameSummary } from '../arbiter/schema.ts';
import { useTeamPanel } from '../arbiter/useTeamPanel.ts';
import { Button } from '../ui/button.tsx';
import { Card, CardTitle } from '../ui/card.tsx';
import { cn } from '../ui/cn.ts';
import { ArbiterSettings } from './ArbiterSettings.tsx';
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
  const { state, save, refresh, practice, submit } = useTeamPanel(makeClient);
  const { config, me, games, notice } = state;

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
          onPractice={(opponent, first) => void practice(opponent, first)}
          onSubmit={(repoUrl, commit) => void submit(repoUrl, commit)}
        />
      )}

      {config.teamId && config.url && (
        <Card className="p-6">
          <CardTitle>Partidas del equipo</CardTitle>
          {games.length === 0 ? (
            <p className="text-sm text-muted">Todavía no hay partidas de {config.teamId}.</p>
          ) : (
            <ul className="divide-y divide-line">
              {games.slice(0, 20).map((game) => (
                <li
                  key={game.game_id}
                  className="flex flex-wrap justify-between gap-2 py-2 text-sm"
                >
                  <span>
                    {game.players['1'].name} vs {game.players['2'].name}
                    <span className="text-muted"> · {KINDS[game.kind] ?? game.kind}</span>
                  </span>
                  <span className="text-muted">{outcome(game, config.teamId)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
