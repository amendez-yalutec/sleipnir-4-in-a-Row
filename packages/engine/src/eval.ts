/**
 * Heurística v1 para las hojas de la búsqueda, desde el punto de vista del que mueve (PLAN_BACKEND.md
 * §4.3). Pocos pesos y explicables; se cambian solo con resultados de arena (B7).
 *
 * - Amenazas: casillas vacías que completarían un cuatro. Es el componente principal.
 * - Centro: las columnas 3 y 4 participan en más líneas de cuatro que las de los bordes.
 */
import { type Bitboard, lastSpotsHi, popcount, winningSpotsLo } from './bitboard.ts';

/** Peso de cada amenaza. Centro: 3 por ficha en las columnas 3–4, 2 en 2–5 y 1 en 1–6. */
export const WEIGHTS = { threat: 12 } as const;

/** Columnas por peso de centro, como palabras lo/hi: [col 3 y 4], [2 y 5], [1 y 6]. */
const CENTER_3 = [0x7f000000, 0x0000007f] as const;
const CENTER_2 = [0x007f0000, 0x00007f00] as const;
const CENTER_1 = [0x00007f00, 0x007f0000] as const;

function center(lo: number, hi: number): number {
  return (
    3 * (popcount(lo & CENTER_3[0]) + popcount(hi & CENTER_3[1])) +
    2 * (popcount(lo & CENTER_2[0]) + popcount(hi & CENTER_2[1])) +
    (popcount(lo & CENTER_1[0]) + popcount(hi & CENTER_1[1]))
  );
}

export function evaluate(position: Bitboard): number {
  const { curLo, curHi, maskLo, maskHi } = position;
  const oppLo = (curLo ^ maskLo) >>> 0;
  const oppHi = (curHi ^ maskHi) >>> 0;

  const mineLo = winningSpotsLo(curLo, curHi, maskLo, maskHi);
  const mine = popcount(mineLo) + popcount(lastSpotsHi());
  const theirsLo = winningSpotsLo(oppLo, oppHi, maskLo, maskHi);
  const theirs = popcount(theirsLo) + popcount(lastSpotsHi());

  return WEIGHTS.threat * (mine - theirs) + center(curLo, curHi) - center(oppLo, oppHi);
}
