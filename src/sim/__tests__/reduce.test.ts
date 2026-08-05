import { describe, expect, it } from 'vitest';
import type { GameMap, GameState, Terrain, Unit } from '../types';
import { reduce } from '../reduce';
import { seedRng } from '../rng';

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

function baseState(units: Unit[], overrides: Partial<GameState> = {}): GameState {
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

describe('reduce', () => {
  it('throws on an illegal action (unreachable destination)', () => {
    const unit = makeUnit({ id: 0, owner: 0, pos: { x: 0, y: 0 } });
    const state = baseState([unit]);
    expect(() => reduce(state, { t: 'act', unitId: 0, to: { x: 7, y: 7 } })).toThrow();
  });

  it('throws when acting on a unit belonging to the other player', () => {
    const mine = makeUnit({ id: 0, owner: 0, pos: { x: 0, y: 0 } });
    const theirs = makeUnit({ id: 1, owner: 1, pos: { x: 5, y: 5 } });
    const state = baseState([mine, theirs]);
    expect(() => reduce(state, { t: 'wait', unitId: 1 })).toThrow();
  });

  it('hasActed blocks a second action on the same unit', () => {
    const unit = makeUnit({ id: 0, owner: 0, pos: { x: 0, y: 0 } });
    const state = baseState([unit]);
    const after = reduce(state, { t: 'wait', unitId: 0 });
    expect(after.units[0]!.hasActed).toBe(true);
    expect(() => reduce(after, { t: 'wait', unitId: 0 })).toThrow();
  });

  it('act moves the unit and sets hasActed', () => {
    const unit = makeUnit({ id: 0, owner: 0, pos: { x: 0, y: 0 } });
    const state = baseState([unit]);
    const after = reduce(state, { t: 'act', unitId: 0, to: { x: 1, y: 1 } });
    const moved = after.units.find(u => u.id === 0)!;
    expect(moved.pos).toEqual({ x: 1, y: 1 });
    expect(moved.hasActed).toBe(true);
  });

  it('act with a target resolves combat and sets hasActed if the attacker survives', () => {
    const attacker = makeUnit({ id: 0, owner: 0, pos: { x: 0, y: 0 }, hp: 10 });
    const defender = makeUnit({ id: 1, owner: 1, pos: { x: 2, y: 0 }, hp: 10 });
    const state = baseState([attacker, defender]);
    const after = reduce(state, { t: 'act', unitId: 0, to: { x: 1, y: 0 }, targetId: 1 });
    const attackerAfter = after.units.find(u => u.id === 0)!;
    const defenderAfter = after.units.find(u => u.id === 1);
    expect(attackerAfter.pos).toEqual({ x: 1, y: 0 });
    expect(defenderAfter).toBeDefined();
    expect(defenderAfter!.hp).toBeLessThan(10);
    expect(attackerAfter.hasActed).toBe(true);
  });

  it('endTurn resets hasActed for the incoming player and marks the outgoing player acted', () => {
    const mine = makeUnit({ id: 0, owner: 0, pos: { x: 0, y: 0 }, hasActed: false });
    const theirs = makeUnit({ id: 1, owner: 1, pos: { x: 5, y: 5 }, hasActed: true });
    const state = baseState([mine, theirs]);
    const after = reduce(state, { t: 'endTurn' });
    expect(after.current).toBe(1);
    expect(after.units.find(u => u.id === 0)!.hasActed).toBe(true);   // outgoing (p0) marked acted
    expect(after.units.find(u => u.id === 1)!.hasActed).toBe(false);  // incoming (p1) cleared
  });

  it('turn increments only when play returns to Player 0', () => {
    const p0 = makeUnit({ id: 0, owner: 0, pos: { x: 0, y: 0 } });
    const p1 = makeUnit({ id: 1, owner: 1, pos: { x: 5, y: 5 } });
    let state = baseState([p0, p1], { turn: 1, current: 0 });

    state = reduce(state, { t: 'endTurn' });   // p0 -> p1
    expect(state.turn).toBe(1);
    expect(state.current).toBe(1);

    state = reduce(state, { t: 'endTurn' });   // p1 -> p0
    expect(state.turn).toBe(2);
    expect(state.current).toBe(0);
  });

  it('eliminating the last enemy unit sets result in the same reduction', () => {
    const attacker = makeUnit({ id: 0, owner: 0, pos: { x: 0, y: 0 }, hp: 10 });
    const defender = makeUnit({ id: 1, owner: 1, pos: { x: 1, y: 0 }, hp: 1 });
    const state = baseState([attacker, defender]);
    const after = reduce(state, { t: 'act', unitId: 0, to: { x: 0, y: 0 }, targetId: 1 });
    expect(after.units.find(u => u.id === 1)).toBeUndefined();
    expect(after.result).toBe('p0');
  });

  it('turn cap produces a draw result on endTurn', () => {
    const p0 = makeUnit({ id: 0, owner: 0, pos: { x: 0, y: 0 } });
    const p1 = makeUnit({ id: 1, owner: 1, pos: { x: 5, y: 5 } });
    const state = baseState([p0, p1], { turn: 50, current: 1 });
    const after = reduce(state, { t: 'endTurn' });   // p1 -> p0, turn becomes 51
    expect(after.turn).toBe(51);
    expect(after.result).toBe('draw');
  });

  it('throws when the game is already over', () => {
    const p0 = makeUnit({ id: 0, owner: 0, pos: { x: 0, y: 0 } });
    const state = baseState([p0], { result: 'p0' });
    expect(() => reduce(state, { t: 'endTurn' })).toThrow();
  });
});
