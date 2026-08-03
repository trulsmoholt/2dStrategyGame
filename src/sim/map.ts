import type { GameMap, Pos, Terrain, Unit, UnitTypeId, Player } from './types';
import { UNIT_STATS } from './units';

export interface ParsedMap {
  readonly map: GameMap;
  readonly units: readonly Unit[];   // ids assigned in reading order, from 0
}

export function inBounds(map: GameMap, p: Pos): boolean {
  return p.x >= 0 && p.y >= 0 && p.x < map.width && p.y < map.height;
}

export function terrainAt(map: GameMap, p: Pos): Terrain {
  const tile = map.tiles[p.y * map.width + p.x];
  if (tile === undefined) throw new Error(`terrainAt: ${p.x},${p.y} out of bounds`);
  return tile;
}

export function chebyshev(a: Pos, b: Pos): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function parseMap(ascii: string): ParsedMap {
  const rawLines = ascii.replace(/\r\n/g, '\n').split('\n');
  // Drop a single leading/trailing blank line, a convention of template
  // literals; interior blank lines are a genuine malformed-map error.
  if (rawLines.length > 0 && rawLines[0] === '') rawLines.shift();
  if (rawLines.length > 0 && rawLines[rawLines.length - 1] === '') rawLines.pop();

  if (rawLines.length === 0) {
    throw new Error('parseMap: empty map');
  }

  const width = rawLines[0]!.length;
  const height = rawLines.length;
  for (const line of rawLines) {
    if (line.length !== width) {
      throw new Error('parseMap: non-rectangular input');
    }
  }

  const tiles: Terrain[] = new Array(width * height);
  const units: Unit[] = [];
  let nextId = 0;

  const placeUnit = (owner: Player, type: UnitTypeId, x: number, y: number) => {
    units.push({ id: nextId++, owner, type, pos: { x, y }, hp: UNIT_STATS[type].maxHp, hasActed: false });
  };

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
        case 'm':
          tiles[idx] = 'plain';
          placeUnit(0, 'melee', x, y);
          break;
        case 'r':
          tiles[idx] = 'plain';
          placeUnit(0, 'ranged', x, y);
          break;
        case 'M':
          tiles[idx] = 'plain';
          placeUnit(1, 'melee', x, y);
          break;
        case 'R':
          tiles[idx] = 'plain';
          placeUnit(1, 'ranged', x, y);
          break;
        default:
          throw new Error(`parseMap: unknown character '${ch}' at ${x},${y}`);
      }
    }
  }

  const countOf = (owner: 0 | 1, type: 'melee' | 'ranged') =>
    units.filter(u => u.owner === owner && u.type === type).length;

  if (countOf(0, 'melee') !== 3 || countOf(0, 'ranged') !== 2 ||
      countOf(1, 'melee') !== 3 || countOf(1, 'ranged') !== 2) {
    throw new Error('parseMap: unit count must be exactly 3 melee + 2 ranged per side');
  }

  return { map: { width, height, tiles }, units };
}
