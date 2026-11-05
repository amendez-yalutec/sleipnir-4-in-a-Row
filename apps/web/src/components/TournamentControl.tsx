/**
 * Iniciar y detener la escucha del bot del torneo desde la web. El bot (y su cómputo) corre en el
 * servidor de esta computadora; la página solo manda la orden y muestra el estado. Donde no se puede
 * controlar (la app en Vercel), la tarjeta no aparece.
 */
import type { ControlStatus } from '@equipo6/contracts';
import { useCallback, useEffect, useState } from 'react';
import type { ApiClient } from '../api/types.ts';
import type { ArbiterConfig } from '../arbiter/config.ts';
import { Button } from '../ui/button.tsx';
import { Card } from '../ui/card.tsx';
import { cn } from '../ui/cn.ts';

export const CONTROL_POLL_MS = 2_000;

const STATES: Readonly<Record<ControlStatus['arbiter']['state'], string>> = {
  disabled: 'Detenido',
  stopped: 'Detenido',
  // El ciclo ya está preguntando por turnos: el primer long polling puede tardar hasta 20 s.
  starting: 'Escuchando: esperando turno',
  waiting: 'Escuchando: esperando turno',
  playing: 'Jugando',
  error: 'Escuchando, con problemas (revisa la URL y el token)',
};

export interface TournamentControlProps {
  readonly api: ApiClient;
  readonly config: ArbiterConfig;
}

export function TournamentControl({ api, config }: TournamentControlProps) {
  // undefined: todavía no se sabe; null: este servidor no permite controlarlo.
  const [status, setStatus] = useState<ControlStatus | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const check = () =>
      void api.control(controller.signal).then((result) => {
        if (result.ok) setStatus(result.data);
        else if (result.kind !== 'aborted') setStatus((current) => (current ? current : null));
      });
    check();
    const timer = setInterval(check, CONTROL_POLL_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [api]);

  const act = useCallback(async (action: () => ReturnType<ApiClient['stopListening']>) => {
    setBusy(true);
    setError(null);
    const result = await action();
    if (result.ok) setStatus(result.data);
    else setError(result.message);
    setBusy(false);
  }, []);

  if (!status) return null;
  const ready = Boolean(config.url && config.token);
  const live = status.running && status.arbiter.state !== 'error';

  return (
    <Card className="space-y-4 p-6">
      <div>
        <h2 className="text-xl font-semibold">Bot del torneo</h2>
        <p className="text-sm text-muted">
          Corre en esta computadora. Usa la URL y el token de arriba; mantén esta computadora
          encendida mientras escucha.
        </p>
      </div>
      <p role="status" className="flex items-center gap-2 text-sm">
        <span
          aria-hidden
          className={cn(
            'size-2.5 rounded-full',
            live ? 'bg-success-dot' : status.running ? 'bg-danger-dot' : 'bg-line',
          )}
        />
        <span className="font-semibold">{STATES[status.arbiter.state]}</span>
        {status.arbiterHost && <span className="text-muted">· {status.arbiterHost}</span>}
        {status.arbiter.gamesPlayed > 0 && (
          <span className="text-muted">· {status.arbiter.gamesPlayed} partidas</span>
        )}
      </p>
      {error && (
        <p role="alert" className="rounded-panel bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
      {status.running ? (
        <Button
          variant="secondary"
          className="w-full"
          disabled={busy}
          onClick={() => void act(() => api.stopListening())}
        >
          Detener escucha
        </Button>
      ) : (
        <>
          <Button
            className="w-full"
            disabled={busy || !ready}
            onClick={() => void act(() => api.startListening(config.url, config.token))}
          >
            Iniciar escucha
          </Button>
          {!ready && (
            <p className="text-sm text-muted">Guarda la URL del árbitro y el token para iniciar.</p>
          )}
        </>
      )}
    </Card>
  );
}
