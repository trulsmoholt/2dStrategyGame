import { describe, expect, it } from 'vitest';
import type { GameMap, GameState, Terrain, Unit } from '../types';
import { resolveAttack } from '../combat';
import { rollInt, seedRng } from '../rng';

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
    ...partial,
  };
}

function stateWith(units: Unit[], rng: number): GameState {
  return { map: flatMap(6, 6), units, current: 0, turn: 1, rng, result: null };
}

describe('resolveAttack', () => {
  it('never deals less than 1 damage, across many seeds and unit pairs', () => {
    for (let seed = 0; seed < 200; seed++) {
      const attacker = makeUnit({ id: 0, owner: 0, type: 'ranged', pos: { x: 0, y: 0 }, hp: 100 });
      const defender = makeUnit({ id: 1, owner: 1, type: 'melee', pos: { x: 5, y: 5 }, hp: 100 });
      const state = stateWith([attacker, defender], seedRng(seed));
      const after = resolveAttack(state, 0, 1);
      const defenderAfter = after.units.find(u => u.id === 1)!;
      const dmg = defender.hp - defenderAfter.hp;
      expect(dmg).toBeGreaterThanOrEqual(1);
    }
  });

  it('a dead defender never counters (attacker HP untouched)', () => {
    const attacker = makeUnit({ id: 0, owner: 0, type: 'melee', pos: { x: 0, y: 0 }, hp: 10 });
    const defender = makeUnit({ id: 1, owner: 1, type: 'melee', pos: { x: 1, y: 0 }, hp: 1 });
    // defender hp=1, melee power 4 +/-1 roll always deals >=3, so this is
    // lethal regardless of the roll.
    for (let seed = 0; seed < 50; seed++) {
      const state = stateWith([attacker, defender], seedRng(seed));
      const after = resolveAttack(state, 0, 1);
      expect(after.units.find(u => u.id === 1)).toBeUndefined();       // defender removed
      const attackerAfter = after.units.find(u => u.id === 0)!;
      expect(attackerAfter.hp).toBe(10);                                // untouched
    }
  });

  it('ranged (range 2) hitting melee (range 1) from distance 2 takes no counter', () => {
    const attacker = makeUnit({ id: 0, owner: 0, type: 'ranged', pos: { x: 0, y: 0 }, hp: 6 });
    const defender = makeUnit({ id: 1, owner: 1, type: 'melee', pos: { x: 2, y: 0 }, hp: 10 });
    for (let seed = 0; seed < 50; seed++) {
      const state = stateWith([attacker, defender], seedRng(seed));
      const after = resolveAttack(state, 0, 1);
      const attackerAfter = after.units.find(u => u.id === 0)!;
      expect(attackerAfter.hp).toBe(6);   // no counter damage
      const defenderAfter = after.units.find(u => u.id === 1)!;
      expect(defenderAfter.hp).toBeLessThan(10);
    }
  });

  it('melee vs melee at range 1 trade both ways', () => {
    const attacker = makeUnit({ id: 0, owner: 0, type: 'melee', pos: { x: 0, y: 0 }, hp: 10 });
    const defender = makeUnit({ id: 1, owner: 1, type: 'melee', pos: { x: 1, y: 0 }, hp: 10 });
    const state = stateWith([attacker, defender], seedRng(1));
    const after = resolveAttack(state, 0, 1);
    const attackerAfter = after.units.find(u => u.id === 0)!;
    const defenderAfter = after.units.find(u => u.id === 1)!;
    expect(defenderAfter.hp).toBeLessThan(10);
    expect(attackerAfter.hp).toBeLessThan(10);
  });

  it('RNG advances exactly once on a lethal hit', () => {
    const attacker = makeUnit({ id: 0, owner: 0, type: 'melee', pos: { x: 0, y: 0 }, hp: 10 });
    const defender = makeUnit({ id: 1, owner: 1, type: 'melee', pos: { x: 1, y: 0 }, hp: 1 });
    const seed = seedRng(77);
    const state = stateWith([attacker, defender], seed);
    const after = resolveAttack(state, 0, 1);
    const [, expectedRng] = rollInt(seed, -1, 1);
    expect(after.rng).toBe(expectedRng);
  });

  it('RNG advances exactly twice on a countered hit', () => {
    const attacker = makeUnit({ id: 0, owner: 0, type: 'melee', pos: { x: 0, y: 0 }, hp: 10 });
    const defender = makeUnit({ id: 1, owner: 1, type: 'melee', pos: { x: 1, y: 0 }, hp: 10 });
    const seed = seedRng(77);
    const state = stateWith([attacker, defender], seed);
    const after = resolveAttack(state, 0, 1);
    const [, rng1] = rollInt(seed, -1, 1);
    const [, rng2] = rollInt(rng1, -1, 1);
    expect(after.rng).toBe(rng2);
  });

  it('a countered attacker that dies is removed', () => {
    const attacker = makeUnit({ id: 0, owner: 0, type: 'melee', pos: { x: 0, y: 0 }, hp: 1 });
    const defender = makeUnit({ id: 1, owner: 1, type: 'melee', pos: { x: 1, y: 0 }, hp: 100 });
    const state = stateWith([attacker, defender], seedRng(3));
    const after = resolveAttack(state, 0, 1);
    expect(after.units.find(u => u.id === 0)).toBeUndefined();
    expect(after.units.find(u => u.id === 1)).toBeDefined();
  });
});
