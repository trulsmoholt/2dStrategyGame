import type { GameState, Player, Pos, Unit, UnitId } from './types';
import { UNIT_STATS } from './units';
import { chebyshev, inBounds, terrainAt, terrainCost } from './map';

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
  const { mp, domain } = UNIT_STATS[unit.type];
  const start = unit.pos;

  // Dial's algorithm: bucket[d] holds tiles with tentative cost exactly d.
  // Valid because every terrain cost is a small positive integer and we
  // only ever care about d in [0, mp] — no heap needed at this scale.
  const buckets: Pos[][] = Array.from({ length: mp + 1 }, () => []);
  buckets[0]!.push(start);

  const best = new Map<string, number>([[key(start), 0]]);
  const settled = new Set<string>();
  const result: Pos[] = [];

  for (let d = 0; d <= mp; d++) {
    for (const p of buckets[d]!) {
      const k = key(p);
      if (settled.has(k)) continue;   // stale duplicate, already finalized cheaper
      settled.add(k);
      result.push(p);

      const isStart = p.x === start.x && p.y === start.y;
      if (!isStart && inEnemyZoc(state, p, unit.owner)) continue;   // terminal, not expanded

      for (const n of neighbors8(p)) {
        const nk = key(n);
        if (settled.has(nk)) continue;
        if (!inBounds(state.map, n)) continue;
        const cost = terrainCost(terrainAt(state.map, n), domain);
        if (!Number.isFinite(cost)) continue;
        if (unitAt(state, n)) continue;

        const nd = d + cost;
        if (nd > mp) continue;
        const prev = best.get(nk);
        if (prev !== undefined && prev <= nd) continue;
        best.set(nk, nd);
        buckets[nd]!.push(n);
      }
    }
  }

  result.sort((a, b) => a.y - b.y || a.x - b.x);
  return result;
}
