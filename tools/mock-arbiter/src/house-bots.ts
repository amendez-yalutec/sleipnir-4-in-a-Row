/** Bots de la casa del OpenAPI: `casa-aleatorio` juega al azar; `casa-basico` gana y bloquea cuatros inmediatos. */
import { type Board, type Player, legalMoves, play, winner } from '@equipo6/engine';
import type { Random } from './random.ts';

export const HOUSE_BOTS = ['casa-aleatorio', 'casa-basico'] as const;
export type HouseBotName = (typeof HOUSE_BOTS)[number];

export function isHouseBot(name: string): name is HouseBotName {
  return (HOUSE_BOTS as readonly string[]).includes(name);
}

function winningMove(board: Board, player: Player): number | undefined {
  return legalMoves(board).find((column) => winner(play(board, column, player)) === player);
}

export function chooseHouseMove(bot: HouseBotName, board: Board, player: Player, random: Random) {
  if (bot === 'casa-basico') {
    const rival: Player = player === 1 ? 2 : 1;
    const urgent = winningMove(board, player) ?? winningMove(board, rival);
    if (urgent !== undefined) return urgent;
  }
  const legal = legalMoves(board);
  return legal[Math.floor(random() * legal.length)];
}
