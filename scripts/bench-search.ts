/**
 * `npm run bench`: velocidad de la búsqueda (nodos por segundo) y profundidad alcanzada con el
 * presupuesto del torneo, desde algunas posiciones fijas. Los resultados van a docs/TECNICO.md.
 */
import { TranspositionTable, replay, search } from '@equipo6/engine';

/** Posiciones realistas: el propio motor juega contra sí mismo a profundidad 6 (determinista). */
function selfPlay(plies: number): number[] {
  const moves: number[] = [];
  for (let i = 0; i < plies; i++) {
    const state = replay(moves);
    if (state.status !== 'playing') break;
    moves.push(search({ board: state.board, toMove: state.toMove }, { maxDepth: 6 }).column);
  }
  return moves;
}

const POSITIONS: Record<string, number[]> = {
  'tablero vacío': [],
  'apertura (4 jugadas)': selfPlay(4),
  'medio juego (14 jugadas)': selfPlay(14),
  'medio juego (24 jugadas)': selfPlay(24),
  'final (34 jugadas)': selfPlay(34),
};

const softMs = Number(process.env.THINK_SOFT_MS ?? 1400);
const hardMs = Number(process.env.THINK_HARD_MS ?? 1800);
const table = new TranspositionTable(20);
console.log(`Presupuesto: soft ${softMs} ms, hard ${hardMs} ms; tabla de ${table.size} entradas\n`);
console.log('| Posición | Jugada | Profundidad | Nodos | ms | Nodos/s | Resuelta |');
console.log('|---|---|---|---|---|---|---|');
for (const [name, moves] of Object.entries(POSITIONS)) {
  const state = replay(moves);
  table.clear();
  const result = search(
    { board: state.board, toMove: state.toMove },
    { softMs, hardMs, now: () => performance.now(), table },
  );
  const rate = Math.round(result.nodes / (result.elapsedMs / 1000));
  console.log(
    `| ${name} | ${result.column} | ${result.depth} | ${result.nodes.toLocaleString('es-GT')} | ${Math.round(result.elapsedMs)} | ${rate.toLocaleString('es-GT')} | ${result.solved ? 'sí' : 'no'} |`,
  );
}
