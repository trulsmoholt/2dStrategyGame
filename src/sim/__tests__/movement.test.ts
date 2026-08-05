import { describe, expect, it } from 'vitest';
import type { GameMap, GameState, Pos, Terrain, Unit } from '../types';
import { reachableTiles } from '../movement';

function buildMap(rows: string[]): GameMap {
  const height = rows.length;
  const width = rows[0]!.length;
  const tiles: Terrain[] = [];
  for (const row of rows) {
    if (row.length !== width) throw new Error('test map rows must be equal length');
    for (const ch of row) {
      tiles.push(ch === '#' ? 'wall' : 'plain');
    }
  }
  return { width, height, tiles };
}

function makeUnit(partial: Partial<Unit> & { id: number; owner: 0 | 1; pos: Pos }): Unit {
  return {
    type: 'melee',
    hp: 10,
    hasActed: false,
    stack: 1,
    ...partial,
  };
}

function buildState(rows: string[], units: Unit[]): GameState {
  return {
    map: buildMap(rows),
    units,
    current: 0,
    turn: 1,
    rng: 1,
    result: null,
  };
}

const has = (tiles: Pos[], p: Pos) => tiles.some(t => t.x === p.x && t.y === p.y);

describe('reachableTiles', () => {
  it('always includes the start tile', () => {
    const rows = ['.....', '.....', '.....', '.....', '.....'];
    const mover = makeUnit({ id: 0, owner: 0, pos: { x: 2, y: 2 } });
    const state = buildState(rows, [mover]);
    const tiles = reachableTiles(state, 0);
    expect(has(tiles, { x: 2, y: 2 })).toBe(true);
  });

  it('walls block entry', () => {
    const rows = [
      '.....',
      '.....',
      '..#..',
      '.....',
      '.....',
    ];
    const mover = makeUnit({ id: 0, owner: 0, pos: { x: 0, y: 2 } });
    const state = buildState(rows, [mover]);
    const tiles = reachableTiles(state, 0);
    expect(has(tiles, { x: 2, y: 2 })).toBe(false);
  });

  it('occupied tiles block entry (friend or foe)', () => {
    const rows = ['.....', '.....', '.....', '.....', '.....'];
    const mover = makeUnit({ id: 0, owner: 0, pos: { x: 2, y: 2 } });
    const ally = makeUnit({ id: 1, owner: 0, pos: { x: 3, y: 2 } });
    const foe = makeUnit({ id: 2, owner: 1, type: 'ranged', pos: { x: 1, y: 2 } });
    const state = buildState(rows, [mover, ally, foe]);
    const tiles = reachableTiles(state, 0);
    expect(has(tiles, { x: 3, y: 2 })).toBe(false);
    expect(has(tiles, { x: 1, y: 2 })).toBe(false);
  });

  it('a tile in enemy ZoC is entered but not expanded', () => {
    // mover (melee, mp 3) walks east from (0,0). The enemy sits at (3,1),
    // off the direct path, so (2,0) falls in its ZoC (Chebyshev 1) two
    // steps in — well short of the mp budget. Without the ZoC rule, (3,0)
    // (distance 3, still within mp) would also be reachable; with it, the
    // only routes to (3,0) pass through terminal ZoC tiles, so it must not be.
    const rows = ['......', '......', '......'];
    const mover = makeUnit({ id: 0, owner: 0, pos: { x: 0, y: 0 } });
    const enemy = makeUnit({ id: 1, owner: 1, pos: { x: 3, y: 1 } });
    const state = buildState(rows, [mover, enemy]);
    const tiles = reachableTiles(state, 0);

    expect(has(tiles, { x: 2, y: 0 })).toBe(true);   // ZoC tile itself: entered
    expect(has(tiles, { x: 3, y: 0 })).toBe(false);  // beyond it: not expanded into
  });

  it('a unit starting in enemy ZoC can still move its full MP away', () => {
    const rows = ['.......', '.......', '.......', '.......', '.......'];
    // mover starts adjacent to the enemy (in its ZoC from the start).
    const mover = makeUnit({ id: 0, owner: 0, pos: { x: 1, y: 2 } });
    const enemy = makeUnit({ id: 1, owner: 1, pos: { x: 0, y: 2 } });
    const state = buildState(rows, [mover, enemy]);
    const tiles = reachableTiles(state, 0);

    // melee mp = 3: full retreat east should reach (4,2).
    expect(has(tiles, { x: 4, y: 2 })).toBe(true);
  });

  it('a diagonal gap between two wall corners is passable', () => {
    const rows = [
      '.#.',
      '#..',
      '...',
    ];
    // (0,0) is open; (1,0) and (0,1) are walls whose corners touch (1,1)
    // diagonally. Diagonal stepping has no corner restriction.
    const mover = makeUnit({ id: 0, owner: 0, pos: { x: 0, y: 0 } });
    const state = buildState(rows, [mover]);
    const tiles = reachableTiles(state, 0);
    expect(has(tiles, { x: 1, y: 1 })).toBe(true);
  });

  it('a 2-thick wall is not passable', () => {
    const rows = [
      '..##..',
      '..##..',
      '..##..',
      '..##..',
      '..##..',
      '..##..',
    ];
    const mover = makeUnit({ id: 0, owner: 0, pos: { x: 0, y: 2 } });
    const state = buildState(rows, [mover]);
    const tiles = reachableTiles(state, 0);
    for (const t of tiles) {
      expect(t.x).toBeLessThan(2);
    }
  });

  it('returns tiles sorted by (y, x) ascending', () => {
    const rows = ['.....', '.....', '.....', '.....', '.....'];
    const mover = makeUnit({ id: 0, owner: 0, pos: { x: 2, y: 2 } });
    const state = buildState(rows, [mover]);
    const tiles = reachableTiles(state, 0);
    for (let i = 1; i < tiles.length; i++) {
      const prev = tiles[i - 1]!;
      const cur = tiles[i]!;
      expect(cur.y > prev.y || (cur.y === prev.y && cur.x > prev.x)).toBe(true);
    }
  });
});
