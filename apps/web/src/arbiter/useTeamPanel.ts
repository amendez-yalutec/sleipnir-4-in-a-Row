/**
 * Estado del panel "Mi equipo": configuración guardada, datos del equipo y de sus partidas, y las
 * acciones (práctica y entrega). La interfaz no sabe de fetch ni de almacenamiento.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type ArbiterClient, ArbiterError, type HouseBot, createArbiterClient } from './client.ts';
import { type ArbiterConfig, loadConfig, saveConfig } from './config.ts';
import type { GameSummary, Me } from './schema.ts';

export type Notice = { readonly tone: 'ok' | 'error'; readonly text: string } | null;

export interface TeamPanelState {
  readonly config: ArbiterConfig;
  readonly connected: boolean | null;
  readonly phase: string | null;
  readonly me: Me | null;
  readonly games: readonly GameSummary[];
  readonly loading: boolean;
  readonly notice: Notice;
}

const messageOf = (error: unknown) =>
  error instanceof ArbiterError ? error.message : 'Algo falló al hablar con el árbitro.';

interface Snapshot {
  readonly connected: boolean | null;
  readonly phase: string | null;
  readonly me: Me | null;
  readonly games: readonly GameSummary[];
  readonly error: string | null;
}

/** Consulta el árbitro: latido, datos del equipo (con token) y sus partidas (con team ID). */
async function fetchSnapshot(client: ArbiterClient, config: ArbiterConfig): Promise<Snapshot> {
  try {
    const health = await client.health();
    const [me, games] = await Promise.all([
      config.token ? client.me() : Promise.resolve(null),
      config.teamId ? client.teamGames() : Promise.resolve([]),
    ]);
    return { connected: true, phase: health.phase ?? null, me, games, error: null };
  } catch (error) {
    const offline = error instanceof ArbiterError && error.status === 0;
    return {
      connected: !offline,
      phase: null,
      me: null,
      games: [],
      error: messageOf(error),
    };
  }
}

export function useTeamPanel(
  makeClient: (config: ArbiterConfig) => ArbiterClient = createArbiterClient,
) {
  const [config, setConfig] = useState<ArbiterConfig>(loadConfig);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [games, setGames] = useState<readonly GameSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const client = useMemo(() => (config.url ? makeClient(config) : null), [config, makeClient]);

  const apply = useCallback((snapshot: Snapshot) => {
    setConnected(snapshot.connected);
    setPhase(snapshot.phase);
    setMe(snapshot.me);
    setGames(snapshot.games);
    if (snapshot.error) setNotice({ tone: 'error', text: snapshot.error });
    setLoading(false);
  }, []);

  // Al cambiar la configuración se vuelve a consultar; una respuesta vieja no pisa a la nueva.
  useEffect(() => {
    if (!client) return;
    let current = true;
    void fetchSnapshot(client, config).then((snapshot) => {
      if (current) apply(snapshot);
    });
    return () => {
      current = false;
    };
  }, [client, config, apply]);

  const refresh = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    apply(await fetchSnapshot(client, config));
  }, [client, config, apply]);

  const save = useCallback((next: ArbiterConfig) => {
    saveConfig(next);
    setNotice(null);
    setConnected(null);
    setConfig(next);
  }, []);

  const run = useCallback(
    async (action: (c: ArbiterClient) => Promise<string>) => {
      if (!client) return;
      try {
        setNotice({ tone: 'ok', text: await action(client) });
        await refresh();
      } catch (error) {
        setNotice({ tone: 'error', text: messageOf(error) });
      }
    },
    [client, refresh],
  );

  const practice = (opponent: HouseBot, first: 1 | 2) =>
    run(async (c) => {
      const { game_id } = await c.practice(opponent, first);
      return `Práctica ${game_id} creada: el bot la juega si está conectado al árbitro.`;
    });

  const submit = (repoUrl: string, commit: string) =>
    run(async (c) => {
      const record = await c.submit(repoUrl, commit);
      return `Entrega registrada con el commit ${record.commit}.`;
    });

  const state: TeamPanelState = { config, connected, phase, me, games, loading, notice };
  return { state, save, refresh, practice, submit };
}
