/** Estado del servidor y del bot del torneo para el encabezado; se consulta cada 15 s. */
import type { Health } from '@equipo6/contracts';
import { useEffect, useState } from 'react';
import type { ApiClient } from '../api/types.ts';

export type BotStatus =
  | { readonly online: null }
  | { readonly online: false }
  | { readonly online: true; readonly tournament: Health['arbiter'] };

export const HEALTH_INTERVAL_MS = 15_000;

export function useBotStatus(client: ApiClient): BotStatus {
  const [status, setStatus] = useState<BotStatus>({ online: null });
  useEffect(() => {
    const controller = new AbortController();
    const check = () =>
      void client.health(controller.signal).then((result) => {
        if (result.ok) setStatus({ online: true, tournament: result.data.arbiter });
        else if (result.kind !== 'aborted') setStatus({ online: false });
      });
    check();
    const timer = setInterval(check, HEALTH_INTERVAL_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [client]);
  return status;
}
