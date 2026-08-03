import type { GameState, Player, Pos, Unit, UnitId } from './types';
import { UNIT_STATS } from './units';
import { chebyshev, inBounds, terrainAt } from './map';

export function unitAt(state: GameState, p: Pos): Unit | undefined {
  return state.units.find(u => u.pos.x === p.x && u.pos.y === p.y);
}

export function inEnemyZoc(state: GameState, p: Pos, owner: Player): boolean {
  return state.units.some(u => u.owner !== owner && chebyshev(u.pos, p) <= 1);
}

const DIRECTIONS: readonly Pos[] = [
  { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
  { x: -1, y:  0 },                  { x: 1, y:  0 },
  { x: -1, y:  1 }, { x: 0, y:  1 }, { x: 1, y:  1 },
];

function neighbors8(p: Pos): Pos[] {
  return DIRECTIONS.map(d => ({ x: p.x + d.x, y: p.y + d.y }));
}

const key = (p: Pos): string => `${p.x},${p.y}`;

export function reachableTiles(state: GameState, unitId: UnitId): Pos[] {
  const unit = state.units.find(u => u.id === unitId);
  if (!unit) throw new Error(`reachableTiles: no unit with id ${unitId}`);
  const { mp } = UNIT_STATS[unit.type];
  const start = unit.pos;

  const visited = new Set<string>([key(start)]);
  const result: Pos[] = [start];

  let frontier: Pos[] = [start];
  for (let depth = 0; depth < mp && frontier.length > 0; depth++) {
    const next: Pos[] = [];
    for (const p of frontier) {
      const isStart = p.x === start.x && p.y === start.y;
      if (!isStart && inEnemyZoc(state, p, unit.owner)) continue;   // terminal, not expanded
      for (const n of neighbors8(p)) {
        if (visited.has(key(n))) continue;
        if (!inBounds(state.map, n)) continue;
        if (terrainAt(state.map, n) !== 'plain') continue;
        if (unitAt(state, n)) continue;
        visited.add(key(n));
        result.push(n);
        next.push(n);
      }
    }
    frontier = next;
  }

  result.sort((a, b) => a.y - b.y || a.x - b.x);
  return result;
}
