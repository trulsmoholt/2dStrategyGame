import { describe, expect, it } from 'vitest';
import { parseMap } from '../map';
import { MAP_NORTHERN_NORWAY } from '../maps';
import { distanceAt, distanceField } from '../movement';

describe('parseMap — legend', () => {
  it('parses "~" as rough and "w" as water', () => {
    const { map } = parseMap(`
~w......
m......M
m......M
m......M
rr....RR
`);
    expect(map.tiles[0]).toBe('rough');
    expect(map.tiles[1]).toBe('water');
    expect(map.tiles[2]).toBe('plain');
  });

  it('throws on an unrecognized character', () => {
    expect(() => parseMap(`
.x.
...
`)).toThrow(/unknown character/);
  });
});

describe('MAP_NORTHERN_NORWAY', () => {
  it('parses without throwing, with the expected roster and dimensions', () => {
    const { map, units } = parseMap(MAP_NORTHERN_NORWAY);
    expect(map.width).toBe(20);
    expect(map.height).toBe(16);
    expect(units.filter(u => u.owner === 0 && u.type === 'melee').length).toBe(3);
    expect(units.filter(u => u.owner === 0 && u.type === 'ranged').length).toBe(2);
    expect(units.filter(u => u.owner === 1 && u.type === 'melee').length).toBe(3);
    expect(units.filter(u => u.owner === 1 && u.type === 'ranged').length).toBe(2);
  });

  it('the causeway connects the two landmasses for a land unit', () => {
    const { map, units } = parseMap(MAP_NORTHERN_NORWAY);
    const p0 = units.find(u => u.owner === 0)!;
    const p1 = units.find(u => u.owner === 1)!;
    const field = distanceField(map, [p1.pos], 'land');
    expect(distanceAt(map, field, p0.pos)).toBeLessThan(Infinity);
  });

  it('is not 180deg-rotationally symmetric', () => {
    const { map } = parseMap(MAP_NORTHERN_NORWAY);
    const mismatches = map.tiles.some((terrain, i) => {
      const x = i % map.width;
      const y = Math.floor(i / map.width);
      const mirrored = map.tiles[(map.height - 1 - y) * map.width + (map.width - 1 - x)];
      return terrain !== mirrored;
    });
    expect(mismatches).toBe(true);
  });
});
