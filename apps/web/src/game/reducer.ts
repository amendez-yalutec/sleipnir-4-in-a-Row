/**
 * Máquina de estados de la partida (PLAN_FRONTEND.md §6). Pura: no llama a la API ni implementa
 * reglas; recibe lo que la API confirmó. `useGame` hace las llamadas según la fase.
 *
 *   setup ─▶ humanTurn ─clic─▶ checking ─▶ botThinking ─▶ humanTurn …
 *   setup ─▶ botThinking (si empieza el bot)
 *   checking / botThinking ─(fin)─▶ finished ─Jugar otra vez─▶ setup
 *   checking / botThinking ─(falla)─▶ error ─Reintentar─▶ la fase que falló
 */
import type { BotInsight, GameState, Level } from '@equipo6/contracts';

export type Phase = 'setup' | 'humanTurn' | 'checking' | 'botThinking' | 'finished' | 'error';

export interface Notice {
  readonly tone: 'info' | 'warning' | 'error';
  readonly text: string;
}

export interface UiState {
  readonly phase: Phase;
  readonly humanFirst: boolean;
  readonly level: Level;
  /** Estados confirmados por la API; el último es el actual. Deshacer = volver atrás aquí. */
  readonly history: readonly GameState[];
  /** Columna de la persona que la API está confirmando. */
  readonly pendingColumn: number | null;
  readonly insight: BotInsight | null;
  readonly notice: Notice | null;
  /** Fase a la que vuelve "Reintentar". */
  readonly resumePhase: 'checking' | 'botThinking' | null;
}

export type Action =
  | { readonly type: 'configure'; readonly humanFirst?: boolean; readonly level?: Level }
  | { readonly type: 'start' }
  | { readonly type: 'columnClicked'; readonly column: number }
  | { readonly type: 'humanConfirmed'; readonly game: GameState }
  | { readonly type: 'humanRejected'; readonly message: string }
  | { readonly type: 'botMoved'; readonly game: GameState }
  | { readonly type: 'failed'; readonly message: string }
  | { readonly type: 'retry' }
  | { readonly type: 'undo' }
  | { readonly type: 'playAgain' }
  | { readonly type: 'reset' }
  | { readonly type: 'loaded'; readonly game: GameState }
  | { readonly type: 'dismissNotice' };

/** Tablero vacío: no es una regla, es el punto de partida que la API también devolvería. */
export const EMPTY_GAME: GameState = {
  moves: [],
  board: Array.from({ length: 7 }, () => Array<0>(8).fill(0)),
  toMove: 1,
  legalMoves: [0, 1, 2, 3, 4, 5, 6, 7],
  status: 'playing',
  winner: null,
  winningCells: [],
};

export const initialState: UiState = {
  phase: 'setup',
  humanFirst: true,
  level: 'medium',
  history: [],
  pendingColumn: null,
  insight: null,
  notice: null,
  resumePhase: null,
};

export const currentGame = (state: UiState): GameState => state.history.at(-1) ?? EMPTY_GAME;
export const humanPlayer = (state: UiState): 1 | 2 => (state.humanFirst ? 1 : 2);

/** Índice del estado anterior en el que le tocaba a la persona, o -1 si no hay a dónde volver. */
function undoTarget(state: UiState): number {
  const human = humanPlayer(state);
  for (let i = state.history.length - 2; i >= 0; i--) {
    if (state.history[i]?.toMove === human) return i;
  }
  return -1;
}

export const canUndo = (state: UiState): boolean =>
  state.phase === 'humanTurn' && undoTarget(state) >= 0;

const WAIT: Notice = { tone: 'info', text: 'Espera, es turno del bot.' };
const FULL: Notice = { tone: 'warning', text: 'Esa columna está llena. Elige otra.' };

function afterMove(state: UiState, game: GameState, next: Phase): UiState {
  return {
    ...state,
    history: [...state.history, game],
    pendingColumn: null,
    phase: game.status === 'playing' ? next : 'finished',
  };
}

export function reducer(state: UiState, action: Action): UiState {
  switch (action.type) {
    case 'configure':
      if (state.phase !== 'setup') return state;
      return {
        ...state,
        humanFirst: action.humanFirst ?? state.humanFirst,
        level: action.level ?? state.level,
      };

    case 'start':
      if (state.phase !== 'setup') return state;
      return {
        ...state,
        history: [EMPTY_GAME],
        insight: null,
        notice: null,
        phase: state.humanFirst ? 'humanTurn' : 'botThinking',
      };

    case 'columnClicked': {
      if (state.phase === 'checking' || state.phase === 'botThinking') {
        return { ...state, notice: WAIT };
      }
      if (state.phase !== 'humanTurn') return state;
      if (!currentGame(state).legalMoves.includes(action.column)) return { ...state, notice: FULL };
      return { ...state, phase: 'checking', pendingColumn: action.column, notice: null };
    }

    case 'humanConfirmed':
      if (state.phase !== 'checking') return state;
      return afterMove(state, action.game, 'botThinking');

    case 'humanRejected':
      if (state.phase !== 'checking') return state;
      return {
        ...state,
        phase: 'humanTurn',
        pendingColumn: null,
        notice: { tone: 'warning', text: action.message },
      };

    case 'botMoved':
      if (state.phase !== 'botThinking') return state;
      return { ...afterMove(state, action.game, 'humanTurn'), insight: action.game.bot ?? null };

    case 'failed':
      if (state.phase !== 'checking' && state.phase !== 'botThinking') return state;
      return {
        ...state,
        phase: 'error',
        resumePhase: state.phase,
        notice: { tone: 'error', text: action.message },
      };

    case 'retry':
      if (state.phase !== 'error' || !state.resumePhase) return state;
      return { ...state, phase: state.resumePhase, resumePhase: null, notice: null };

    case 'undo': {
      const target = undoTarget(state);
      if (state.phase !== 'humanTurn' || target < 0) return state;
      return { ...state, history: state.history.slice(0, target + 1), insight: null, notice: null };
    }

    case 'playAgain':
      if (state.phase !== 'finished') return state;
      return { ...initialState, humanFirst: state.humanFirst, level: state.level };

    case 'reset':
      return { ...initialState, humanFirst: state.humanFirst, level: state.level };

    case 'loaded':
      // Posición cargada desde la URL: la persona juega con el color al que le toca.
      return {
        ...initialState,
        level: state.level,
        humanFirst: action.game.toMove === 1,
        history: [action.game],
        phase: action.game.status === 'playing' ? 'humanTurn' : 'finished',
      };

    case 'dismissNotice':
      return { ...state, notice: null };
  }
}
