import { describe, expect, it } from 'vitest';
import type { GameMap, GameState, Terrain, Unit } from '../../sim/index';
import { reduce, seedRng } from '../../sim/index';
import { chooseAction, chooseTurn } from '../ai';

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

function stateWith(units: Unit[], overrides: Partial<GameState> = {}): GameState {
  return {
    map: flatMap(12, 12),
    units,
    current: 0,
    turn: 1,
    rng: seedRng(1),
    result: null,
    ...overrides,
  };
}

describe('chooseAction — fight phase', () => {
  it('prefers a lethal kill over chipping a tougher target', () => {
    const attacker = makeUnit({ id: 0, owner: 0, type: 'melee', pos: { x: 0, y: 0 }, hp: 10 });
    const killable = makeUnit({ id: 1, owner: 1, type: 'melee', pos: { x: 1, y: 0 }, hp: 3 });
    const tough = makeUnit({ id: 2, owner: 1, type: 'melee', pos: { x: 0, y: 3 }, hp: 10 });
    const state = stateWith([attacker, killable, tough]);

    const action = chooseAction(state);
    expect(action).toEqual({ t: 'act', unitId: 0, to: { x: 0, y: 0 }, targetId: 1 });
  });

  it('a ranged unit prefers shooting from standoff range over closing in and eating a counter', () => {
    const shooter = makeUnit({ id: 0, owner: 0, type: 'ranged', pos: { x: 0, y: 0 }, hp: 6 });
    const target = makeUnit({ id: 1, owner: 1, type: 'melee', pos: { x: 2, y: 0 }, hp: 10 });
    const state = stateWith([shooter, target]);

    const action = chooseAction(state);
    expect(action).toEqual({ t: 'act', unitId: 0, to: { x: 0, y: 0 }, targetId: 1 });
  });
});

describe('chooseAction — seek phase', () => {
  it('moves toward the nearest enemy when no attack is reachable', () => {
    const seeker = makeUnit({ id: 0, owner: 0, type: 'melee', pos: { x: 0, y: 0 }, hp: 10 });
    const enemy = makeUnit({ id: 1, owner: 1, type: 'melee', pos: { x: 10, y: 10 }, hp: 10 });
    const state = stateWith([seeker, enemy]);

    const before = enemy.pos;
    const action = chooseAction(state);
    expect(action.t).toBe('act');
    if (action.t !== 'act') throw new Error('unreachable');
    const distBefore = Math.max(Math.abs(seeker.pos.x - before.x), Math.abs(seeker.pos.y - before.y));
    const distAfter = Math.max(Math.abs(action.to.x - before.x), Math.abs(action.to.y - before.y));
    expect(distAfter).toBeLessThan(distBefore);
    expect(action.targetId).toBeUndefined();
  });

  it('waits when boxed in and no move can shorten the distance to any enemy', () => {
    // (1,1) is fully enclosed by walls; the only reachable tile is itself.
    const rows = [
      '#####',
      '#.###',
      '#####',
      '.....',
      '.....',
    ];
    const height = rows.length;
    const width = rows[0]!.length;
    const tiles: Terrain[] = [];
    for (const row of rows) for (const ch of row) tiles.push(ch === '#' ? 'wall' : 'plain');
    const map: GameMap = { width, height, tiles };

    const boxed = makeUnit({ id: 0, owner: 0, type: 'melee', pos: { x: 1, y: 1 }, hp: 10 });
    const enemy = makeUnit({ id: 1, owner: 1, type: 'melee', pos: { x: 2, y: 4 }, hp: 10 });
    const state: GameState = { map, units: [boxed, enemy], current: 0, turn: 1, rng: seedRng(1), result: null };

    expect(chooseAction(state)).toEqual({ t: 'wait', unitId: 0 });
  });
});

describe('chooseAction — turn bookkeeping', () => {
  it('returns endTurn once every unit for the current player has acted', () => {
    const acted = makeUnit({ id: 0, owner: 0, pos: { x: 0, y: 0 }, hasActed: true });
    const theirs = makeUnit({ id: 1, owner: 1, pos: { x: 5, y: 5 }, hasActed: false });
    const state = stateWith([acted, theirs]);
    expect(chooseAction(state)).toEqual({ t: 'endTurn' });
  });
});

describe('chooseTurn', () => {
  it('is pure: never mutates its input and is deterministic', () => {
    const a = makeUnit({ id: 0, owner: 0, type: 'melee', pos: { x: 0, y: 0 }, hp: 10 });
    const b = makeUnit({ id: 1, owner: 0, type: 'ranged', pos: { x: 1, y: 1 }, hp: 6 });
    const enemy = makeUnit({ id: 2, owner: 1, type: 'melee', pos: { x: 8, y: 8 }, hp: 10 });
    const state = stateWith([a, b, enemy]);
    const snapshot = JSON.parse(JSON.stringify(state));

    const first = chooseTurn(state);
    expect(state).toEqual(snapshot);          // no mutation, including state.rng
    expect(state.rng).toBe(snapshot.rng);

    const second = chooseTurn(state);
    expect(second).toEqual(first);             // deterministic
  });

  it('ends with endTurn and covers every un-acted unit', () => {
    const a = makeUnit({ id: 0, owner: 0, type: 'melee', pos: { x: 0, y: 0 }, hp: 10 });
    const b = makeUnit({ id: 1, owner: 0, type: 'ranged', pos: { x: 1, y: 1 }, hp: 6 });
    const enemy = makeUnit({ id: 2, owner: 1, type: 'melee', pos: { x: 8, y: 8 }, hp: 10 });
    const state = stateWith([a, b, enemy]);

    const actions = chooseTurn(state);
    expect(actions[actions.length - 1]).toEqual({ t: 'endTurn' });
    const actedUnitIds = new Set(
      actions.filter(act => act.t !== 'endTurn').map(act => (act as { unitId: number }).unitId),
    );
    expect(actedUnitIds).toEqual(new Set([0, 1]));
  });

  it('replays cleanly through the real reduce() in a simple, non-diverging scenario', () => {
    const attacker = makeUnit({ id: 0, owner: 0, type: 'melee', pos: { x: 0, y: 0 }, hp: 10 });
    const enemy = makeUnit({ id: 1, owner: 1, type: 'melee', pos: { x: 8, y: 8 }, hp: 10 });
    const state = stateWith([attacker, enemy]);

    const actions = chooseTurn(state);
    let s = state;
    for (const action of actions) {
      s = reduce(s, action);
    }
    expect(s.current).toBe(1);
  });
});
