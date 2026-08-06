import type { Domain, GameMap, MapDef, Pos, RosterEntry, Terrain, Unit } from './types';
import { UNIT_STATS } from './units';

export interface ParsedMap {
  readonly map: GameMap;
  readonly units: readonly Unit[];   // ids assigned in roster array order, from 0
}

export function inBounds(map: GameMap, p: Pos): boolean {
  return p.x >= 0 && p.y >= 0 && p.x < map.width && p.y < map.height;
}

export function terrainAt(map: GameMap, p: Pos): Terrain {
  const tile = map.tiles[p.y * map.width + p.x];
  if (tile === undefined) throw new Error(`terrainAt: ${p.x},${p.y} out of bounds`);
  return tile;
}

// Movement cost to enter a tile, by terrain and domain. Infinity = impassable.
// Only `land` reflects real, exercised design (existing `wall` behavior,
// plus `rough`/`water`, both parsed by `parseTerrain` but not yet placed by
// any production map — MAP_STANDARD is `.`/`#` only). `sea` and `air` have
// no unit yet (ROADMAP.md phase 3), so their rows are inert placeholders,
// not real decisions:
// - sea: only water is enterable — a ship can't sail onto land.
// - air: uniformly cost 1 everywhere — "planes ignore terrain" is the
//   simplest coherent placeholder; anything more specific (e.g. blocking
//   flight over walls) is a real design call for when phase 3 defines
//   actual air units, not now. Revisit both rows at that point.
const TERRAIN_COST: Record<Terrain, Record<Domain, number>> = {
  plain: { land: 1,        sea: Infinity, air: 1 },
  wall:  { land: Infinity, sea: Infinity, air: 1 },
  rough: { land: 2,        sea: Infinity, air: 1 },
  water: { land: Infinity, sea: 1,        air: 1 },
};

export function terrainCost(terrain: Terrain, domain: Domain): number {
  return TERRAIN_COST[terrain][domain];
}

export function chebyshev(a: Pos, b: Pos): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function parseTerrain(ascii: string): GameMap {
  const rawLines = ascii.replace(/\r\n/g, '\n').split('\n');
  // Drop a single leading/trailing blank line, a convention of template
  // literals; interior blank lines are a genuine malformed-map error.
  if (rawLines.length > 0 && rawLines[0] === '') rawLines.shift();
  if (rawLines.length > 0 && rawLines[rawLines.length - 1] === '') rawLines.pop();

  if (rawLines.length === 0) {
    throw new Error('parseTerrain: empty map');
  }

  const width = rawLines[0]!.length;
  const height = rawLines.length;
  for (const line of rawLines) {
    if (line.length !== width) {
      throw new Error('parseTerrain: non-rectangular input');
    }
  }

  const tiles: Terrain[] = new Array(width * height);

  for (let y = 0; y < height; y++) {
    const line = rawLines[y]!;
    for (let x = 0; x < width; x++) {
      const ch = line[x];
      const idx = y * width + x;
      switch (ch) {
        case '.':
          tiles[idx] = 'plain';
          break;
        case '#':
          tiles[idx] = 'wall';
          break;
        case '~':
          tiles[idx] = 'rough';
          break;
        case 'w':
          tiles[idx] = 'water';
          break;
        default:
          throw new Error(`parseTerrain: unknown character '${ch}' at ${x},${y}`);
      }
    }
  }

  return { width, height, tiles };
}

export function buildRoster(roster: readonly RosterEntry[]): readonly Unit[] {
  const countOf = (owner: 0 | 1, type: 'melee' | 'ranged') =>
    roster.filter(e => e.owner === owner && e.type === type).length;

  if (countOf(0, 'melee') !== 3 || countOf(0, 'ranged') !== 2 ||
      countOf(1, 'melee') !== 3 || countOf(1, 'ranged') !== 2) {
    throw new Error('buildRoster: unit count must be exactly 3 melee + 2 ranged per side');
  }

  const seen = new Set<string>();
  for (const entry of roster) {
    const key = `${entry.pos.x},${entry.pos.y}`;
    if (seen.has(key)) {
      throw new Error('buildRoster: two roster entries share a start position');
    }
    seen.add(key);
  }

  return roster.map((entry, id) => ({
    id,
    owner: entry.owner,
    type: entry.type,
    pos: entry.pos,
    hp: UNIT_STATS[entry.type].maxHp,
    hasActed: false,
    stack: 1,
  }));
}

export function loadMap(def: MapDef): ParsedMap {
  const map = parseTerrain(def.terrain);
  const units = buildRoster(def.roster);
  for (const u of units) {
    if (!inBounds(map, u.pos)) {
      throw new Error(`loadMap: unit ${u.id} at ${u.pos.x},${u.pos.y} is out of bounds`);
    }
    const terrain = terrainAt(map, u.pos);
    if (terrainCost(terrain, UNIT_STATS[u.type].domain) === Infinity) {
      throw new Error(`loadMap: unit ${u.id} at ${u.pos.x},${u.pos.y} starts on impassable terrain '${terrain}'`);
    }
  }
  return { map, units };
}
