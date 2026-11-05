import logo from '../assets/sleipnir-icon.svg';
import type { BotStatus } from '../game/useBotStatus.ts';
import { cn } from '../ui/cn.ts';

const TOURNAMENT: Record<string, string> = {
  playing: 'jugando en el torneo',
  waiting: 'esperando turno en el torneo',
  starting: 'conectándose al torneo',
  error: 'con problemas en el torneo',
  stopped: 'fuera del torneo',
};

export function describeStatus(status: BotStatus): {
  text: string;
  tone: 'ok' | 'off' | 'unknown';
} {
  if (status.online === null) return { text: 'Conectando…', tone: 'unknown' };
  if (!status.online) return { text: 'Sin conexión con el bot', tone: 'off' };
  const detail = status.tournament.enabled ? TOURNAMENT[status.tournament.state] : undefined;
  return { text: detail ? `Bot en línea · ${detail}` : 'Bot en línea', tone: 'ok' };
}

export function Header({ status }: { readonly status: BotStatus }) {
  const { text, tone } = describeStatus(status);
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        {/* Lockup del equipo (Figma "Sleipnir — Logo"): ícono, nombre y bajada. */}
        <div className="flex items-center gap-3">
          <img src={logo} alt="" width={44} height={44} className="size-11 shrink-0" />
          <div className="leading-tight">
            <h1 className="text-2xl font-normal tracking-tight">sleipnir</h1>
            <p className="text-xs font-semibold tracking-wide text-accent-pressed uppercase">
              Equipo 6<span className="hidden sm:inline"> · Cuatro en línea 8×7</span>
            </p>
          </div>
        </div>
        <p role="status" className="flex items-center gap-2 text-sm whitespace-nowrap text-muted">
          <span
            aria-hidden
            className={cn(
              'size-2.5 rounded-full',
              tone === 'ok' && 'bg-success-dot',
              tone === 'off' && 'bg-danger-dot',
              tone === 'unknown' && 'bg-line',
            )}
          />
          {text}
        </p>
      </div>
    </header>
  );
}
