import { describe, expect, it } from 'vitest';
import type { MapDef, RosterEntry } from '../types';
import { parseTerrain, buildRoster, loadMap } from '../map';
import { distanceAt, distanceField } from '../movement';
import { getMapDef, MAP_STANDARD_ID, MAP_NORTHERN_NORWAY_ID } from '../maps';

describe('parseTerrain', () => {
  it('maps each character to the right terrain', () => {
    const map = parseTerrain('.#~w');
    expect(map.width).toBe(4);
    expect(map.height).toBe(1);
    expect(map.tiles).toEqual(['plain', 'wall', 'rough', 'water']);
  });

  it('strips a single leading/trailing blank line', () => {
    const map = parseTerrain(`
..
..
`);
    expect(map.width).toBe(2);
    expect(map.height).toBe(2);
  });

  it('throws on non-rectangular input', () => {
    expect(() => parseTerrain('..\n.')).toThrow(/non-rectangular/);
  });

  it('throws on an unknown character', () => {
    expect(() => parseTerrain('.x.')).toThrow(/unknown character/);
  });

  it('throws on empty input', () => {
    expect(() => parseTerrain('')).toThrow(/empty map/);
  });
});

function validRoster(): RosterEntry[] {
  return [
    { type: 'melee', owner: 0, pos: { x: 0, y: 1 } },
    { type: 'melee', owner: 0, pos: { x: 1, y: 1 } },
    { type: 'melee', owner: 0, pos: { x: 2, y: 1 } },
    { type: 'ranged', owner: 0, pos: { x: 3, y: 1 } },
    { type: 'ranged', owner: 0, pos: { x: 4, y: 1 } },
    { type: 'melee', owner: 1, pos: { x: 7, y: 4 } },
    { type: 'melee', owner: 1, pos: { x: 6, y: 4 } },
    { type: 'melee', owner: 1, pos: { x: 5, y: 4 } },
    { type: 'ranged', owner: 1, pos: { x: 4, y: 4 } },
    { type: 'ranged', owner: 1, pos: { x: 3, y: 4 } },
  ];
}

describe('buildRoster', () => {
  it('builds units with ids in array order and correct starting hp', () => {
    const units = buildRoster(validRoster());
    expect(units.length).toBe(10);
    expect(units.map(u => u.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(units[0]!.hp).toBeGreaterThan(0);
    expect(units.every(u => u.stack === 1 && !u.hasActed)).toBe(true);
  });

  it('throws when a side does not have exactly 3 melee + 2 ranged', () => {
    const bad = validRoster().slice(1);
    expect(() => buildRoster(bad)).toThrow(/unit count must be exactly/);
  });

  it('throws when two entries share a start position', () => {
    const roster = validRoster();
    const withDup = roster.map((e, i) => (i === 4 ? { ...e, pos: roster[0]!.pos } : e));
    expect(() => buildRoster(withDup)).toThrow(/share a start position/);
  });
});

describe('loadMap', () => {
  const fixture: MapDef = {
    id: 'fixture',
    terrain: [
      '..~...w.',
      '........',
      '...##...',
      '........',
      '........',
    ].join('\n'),
    roster: validRoster(),
  };

  it('parses a standalone map/roster pair', () => {
    const { map, units } = loadMap(fixture);
    expect(map.width).toBe(8);
    expect(map.height).toBe(5);
    expect(units.length).toBe(10);
  });

  it('throws when a roster entry is out of bounds', () => {
    const bad: MapDef = {
      ...fixture,
      roster: validRoster().map((e, i) => (i === 0 ? { ...e, pos: { x: 99, y: 99 } } : e)),
    };
    expect(() => loadMap(bad)).toThrow(/out of bounds/);
  });

  it('throws when a roster entry starts on impassable terrain', () => {
    const bad: MapDef = {
      ...fixture,
      roster: validRoster().map((e, i) => (i === 0 ? { ...e, pos: { x: 6, y: 0 } } : e)),
    };
    expect(() => loadMap(bad)).toThrow(/impassable terrain/);
  });
});

describe('getMapDef', () => {
  it('returns the standard map def', () => {
    const def = getMapDef(MAP_STANDARD_ID);
    expect(def.id).toBe(MAP_STANDARD_ID);
    expect(def.roster.length).toBe(10);
  });

  it('throws for an unknown map id', () => {
    expect(() => getMapDef('bogus')).toThrow(/unknown map id/);
  });
});

describe('MAP_NORTHERN_NORWAY', () => {
  it('loads without throwing, with the expected roster and dimensions', () => {
    const { map, units } = loadMap(getMapDef(MAP_NORTHERN_NORWAY_ID));
    expect(map.width).toBe(20);
    expect(map.height).toBe(16);
    expect(units.filter(u => u.owner === 0 && u.type === 'melee').length).toBe(3);
    expect(units.filter(u => u.owner === 0 && u.type === 'ranged').length).toBe(2);
    expect(units.filter(u => u.owner === 1 && u.type === 'melee').length).toBe(3);
    expect(units.filter(u => u.owner === 1 && u.type === 'ranged').length).toBe(2);
  });

  it('the causeway connects the two landmasses for a land unit', () => {
    const { map, units } = loadMap(getMapDef(MAP_NORTHERN_NORWAY_ID));
    const p0 = units.find(u => u.owner === 0)!;
    const p1 = units.find(u => u.owner === 1)!;
    const field = distanceField(map, [p1.pos], 'land');
    expect(distanceAt(map, field, p0.pos)).toBeLessThan(Infinity);
  });

  it('is not 180deg-rotationally symmetric', () => {
    const { map } = loadMap(getMapDef(MAP_NORTHERN_NORWAY_ID));
    const mismatches = map.tiles.some((terrain, i) => {
      const x = i % map.width;
      const y = Math.floor(i / map.width);
      const mirrored = map.tiles[(map.height - 1 - y) * map.width + (map.width - 1 - x)];
      return terrain !== mirrored;
    });
    expect(mismatches).toBe(true);
  });
});
