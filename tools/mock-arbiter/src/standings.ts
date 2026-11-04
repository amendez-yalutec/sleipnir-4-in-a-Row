/** Tabla de posiciones: solo cuentan las partidas de liga terminadas. Victoria 3, empate 1, derrota 0. */
import type { MockGame, TeamInfo } from './game.ts';

export function computeStandings(teams: readonly TeamInfo[], games: Iterable<MockGame>) {
  const rows = new Map(
    teams.map((team) => [
      team.id,
      {
        team: { id: team.id, name: team.name, members: [...team.members] },
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        points: 0,
      },
    ]),
  );

  for (const game of games) {
    if (game.kind !== 'league' || !game.result) continue;
    for (const player of [1, 2] as const) {
      const seat = game.seats[player];
      const row = seat.type === 'team' ? rows.get(seat.team.id) : undefined;
      if (!row) continue;
      row.played++;
      if (game.result.winner === null) {
        row.drawn++;
        row.points += 1;
      } else if (game.result.winner === player) {
        row.won++;
        row.points += 3;
      } else {
        row.lost++;
      }
    }
  }

  return (
    [...rows.values()]
      // Desempates del árbitro: puntos, enfrentamiento directo, diferencia V−D y sorteo. El mock omite
      // el enfrentamiento directo y cambia el sorteo por el id, para ser determinista.
      .sort(
        (a, b) =>
          b.points - a.points ||
          b.won - b.lost - (a.won - a.lost) ||
          a.team.id.localeCompare(b.team.id),
      )
      .map((row, index) => ({ position: index + 1, ...row }))
  );
}
