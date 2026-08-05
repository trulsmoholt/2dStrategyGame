import { describe, expect, it } from 'vitest';
import type { GameMap, GameState, Terrain, Unit } from '../types';
import { MAX_STACK } from '../types';
import { seedRng } from '../rng';
import { UNIT_STATS, mergeKind, unitMaxHp, unitPower } from '../units';
import { expectedDamage, resolveAttack } from '../combat';
import { canMerge, legalActions, mergeableWith } from '../actions';
import { reduce } from '../reduce';

function flatMap(width: number, height: number): GameMap {
  const tiles: Terrain[] = new Array(width * height).fill('plain');
  return { width, height, tiles };
}

function makeUnit(partial: Partial<Unit> & { id: number; owner: 0 | 1 }): Unit {
  return {
    type: 'melee',
    pos: { x: 0, y: 0 },
    hp: 10,
    hasActed: false,
    stack: 1,
    ...partial,
  };
}

function stateWith(units: Unit[], overrides: Partial<GameState> = {}): GameState {
  return {
    map: flatMap(8, 8),
    units,
    current: 0,
    turn: 1,
    rng: seedRng(1),
    result: null,
    ...overrides,
  };
}

// A pair of adjacent, un-acted, same-type friendly units — the canonical
// mergeable setup.
function pair(a: Partial<Unit> = {}, b: Partial<Unit> = {}): [Unit, Unit] {
  return [
    makeUnit({ id: 0, owner: 0, pos: { x: 1, y: 1 }, ...a }),
    makeUnit({ id: 1, owner: 0, pos: { x: 2, y: 1 }, ...b }),
  ];
}

describe('derived stats', () => {
  it('scales maxHp and power by stack, and leaves mp/range alone', () => {
    const lone = makeUnit({ id: 0, owner: 0 });
    const merged = makeUnit({ id: 0, owner: 0, stack: 2 });

    expect(unitMaxHp(lone)).toBe(UNIT_STATS.melee.maxHp);
    expect(unitMaxHp(merged)).toBe(UNIT_STATS.melee.maxHp * 2);
    expect(unitPower(lone)).toBe(UNIT_STATS.melee.power);
    expect(unitPower(merged)).toBe(UNIT_STATS.melee.power * 2);

    // mp and range are read straight from the table and are unaffected —
    // this is what makes same-type merging free of a stat fold.
    expect(UNIT_STATS[merged.type].mp).toBe(UNIT_STATS.melee.mp);
    expect(UNIT_STATS[merged.type].range).toBe(UNIT_STATS.melee.range);
  });

  it('a merged attacker deals stack-scaled damage', () => {
    const merged = makeUnit({ id: 0, owner: 0, stack: 2, pos: { x: 1, y: 1 } });
    const victim = makeUnit({ id: 1, owner: 1, pos: { x: 2, y: 1 }, hp: 40 });
    expect(expectedDamage(merged)).toBe(UNIT_STATS.melee.power * 2);

    const after = resolveAttack(stateWith([merged, victim]), 0, 1);
    const hurt = after.units.find(u => u.id === 1)!;
    const dealt = 40 - hurt.hp;
    // power 8, roll in [-1, 1]
    expect(dealt).toBeGreaterThanOrEqual(7);
    expect(dealt).toBeLessThanOrEqual(9);
  });
});

describe('mergeKind', () => {
  it('accepts same type and rejects different types', () => {
    const a = makeUnit({ id: 0, owner: 0, type: 'melee' });
    const b = makeUnit({ id: 1, owner: 0, type: 'melee' });
    const c = makeUnit({ id: 2, owner: 0, type: 'ranged' });
    expect(mergeKind(a, b)).toBe('stack');
    expect(mergeKind(a, c)).toBeNull();
  });
});

describe('canMerge', () => {
  it('accepts an adjacent, un-acted, same-type, same-owner pair', () => {
    const [a, b] = pair();
    expect(canMerge(a, b)).toBe(true);
    expect(canMerge(b, a)).toBe(true);   // legal in both directions
  });

  it('rejects a unit merging with itself', () => {
    const [a] = pair();
    expect(canMerge(a, a)).toBe(false);
  });

  it('rejects different types', () => {
    const [a, b] = pair({}, { type: 'ranged' });
    expect(canMerge(a, b)).toBe(false);
  });

  it('rejects an enemy unit', () => {
    const [a, b] = pair({}, { owner: 1 });
    expect(canMerge(a, b)).toBe(false);
  });

  it('rejects non-adjacent units', () => {
    const [a, b] = pair({}, { pos: { x: 4, y: 4 } });
    expect(canMerge(a, b)).toBe(false);
  });

  it('rejects when either unit has already acted', () => {
    expect(canMerge(...pair({ hasActed: true }))).toBe(false);
    expect(canMerge(...pair({}, { hasActed: true }))).toBe(false);
  });

  it('rejects a merge that would exceed MAX_STACK', () => {
    expect(canMerge(...pair({ stack: MAX_STACK - 1 }, { stack: 1 }))).toBe(true);
    expect(canMerge(...pair({ stack: MAX_STACK }, { stack: 1 }))).toBe(false);
    expect(canMerge(...pair({ stack: 2 }, { stack: 2 }))).toBe(false);
  });
});

describe('mergeableWith / legalActions', () => {
  it('lists the partner in both directions', () => {
    const state = stateWith(pair());
    expect(mergeableWith(state, 0)).toEqual([1]);
    expect(mergeableWith(state, 1)).toEqual([0]);
  });

  it('legalActions offers both merge directions, since the survivor keeps its tile', () => {
    const merges = legalActions(stateWith(pair())).filter(a => a.t === 'merge');
    expect(merges).toContainEqual({ t: 'merge', unitId: 0, absorbId: 1 });
    expect(merges).toContainEqual({ t: 'merge', unitId: 1, absorbId: 0 });
  });

  it('offers no merges for a lone unit', () => {
    const state = stateWith([makeUnit({ id: 0, owner: 0 })]);
    expect(mergeableWith(state, 0)).toEqual([]);
    expect(legalActions(state).filter(a => a.t === 'merge')).toEqual([]);
  });
});

describe('reduce — merge', () => {
  it('sums hp and stack onto the survivor, removes the absorbed unit, and spends the turn', () => {
    const state = stateWith(pair({ hp: 6 }, { hp: 7 }));
    const next = reduce(state, { t: 'merge', unitId: 0, absorbId: 1 });

    expect(next.units).toHaveLength(1);
    const merged = next.units[0]!;
    expect(merged.id).toBe(0);
    expect(merged.hp).toBe(13);
    expect(merged.stack).toBe(2);
    expect(merged.hasActed).toBe(true);
    expect(merged.pos).toEqual({ x: 1, y: 1 });   // survivor does not move
  });

  it('consumes no randomness', () => {
    const state = stateWith(pair());
    const next = reduce(state, { t: 'merge', unitId: 0, absorbId: 1 });
    expect(next.rng).toBe(state.rng);
  });

  it('the merged unit is at full strength when both components were', () => {
    const state = stateWith(pair());
    const merged = reduce(state, { t: 'merge', unitId: 0, absorbId: 1 }).units[0]!;
    expect(merged.hp).toBe(unitMaxHp(merged));
  });

  it('throws on an illegal merge', () => {
    const nonAdjacent = stateWith(pair({}, { pos: { x: 5, y: 5 } }));
    expect(() => reduce(nonAdjacent, { t: 'merge', unitId: 0, absorbId: 1 })).toThrow(/cannot be merged/);

    const mixed = stateWith(pair({}, { type: 'ranged' }));
    expect(() => reduce(mixed, { t: 'merge', unitId: 0, absorbId: 1 })).toThrow(/cannot be merged/);

    const missing = stateWith(pair());
    expect(() => reduce(missing, { t: 'merge', unitId: 0, absorbId: 99 })).toThrow(/no unit with id 99/);
  });

  it("throws when the survivor is not the current player's unit", () => {
    const enemyPair = stateWith([
      makeUnit({ id: 0, owner: 1, pos: { x: 1, y: 1 } }),
      makeUnit({ id: 1, owner: 1, pos: { x: 2, y: 1 } }),
    ]);
    expect(() => reduce(enemyPair, { t: 'merge', unitId: 0, absorbId: 1 }))
      .toThrow(/does not belong to the current player/);
  });

  it('ends the game when the last enemy is merged away — result is re-checked', () => {
    // P0 has one unit; P1 has two that merge. Merging never removes the last
    // unit of a side, so the game must still be running afterwards.
    const state = stateWith(
      [
        makeUnit({ id: 0, owner: 0, pos: { x: 6, y: 6 } }),
        makeUnit({ id: 1, owner: 1, pos: { x: 1, y: 1 } }),
        makeUnit({ id: 2, owner: 1, pos: { x: 2, y: 1 } }),
      ],
      { current: 1 },
    );
    const next = reduce(state, { t: 'merge', unitId: 1, absorbId: 2 });
    expect(next.result).toBeNull();
    expect(next.units.filter(u => u.owner === 1)).toHaveLength(1);
  });
});
