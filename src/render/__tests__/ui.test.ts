import { describe, expect, it } from 'vitest';
import type { GameMap, GameState, Terrain, Unit } from '../../sim/index';
import { seedRng } from '../../sim/index';
import { onCancel, onTileClick, pixelToTile } from '../ui';

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
    map: flatMap(8, 8),
    units,
    current: 0,
    turn: 1,
    rng: seedRng(1),
    result: null,
    ...overrides,
  };
}

describe('pixelToTile', () => {
  it('maps pixel coordinates to 32px tiles', () => {
    expect(pixelToTile(0, 0)).toEqual({ x: 0, y: 0 });
    expect(pixelToTile(31, 31)).toEqual({ x: 0, y: 0 });
    expect(pixelToTile(32, 63)).toEqual({ x: 1, y: 1 });
    expect(pixelToTile(320, 480)).toEqual({ x: 10, y: 15 });
  });
});

describe('onTileClick — idle', () => {
  it('selecting an own un-acted unit highlights its reachable tiles', () => {
    const mine = makeUnit({ id: 0, owner: 0, pos: { x: 2, y: 2 } });
    const state = stateWith([mine]);
    const { ui, action } = onTileClick(state, { k: 'idle' }, { x: 2, y: 2 });
    expect(action).toBeUndefined();
    expect(ui.k).toBe('selected');
    if (ui.k === 'selected') {
      expect(ui.unitId).toBe(0);
      expect(ui.reachable.length).toBeGreaterThan(0);
    }
  });

  it('clicking an enemy unit is a no-op', () => {
    const theirs = makeUnit({ id: 1, owner: 1, pos: { x: 2, y: 2 } });
    const state = stateWith([theirs]);
    const { ui, action } = onTileClick(state, { k: 'idle' }, { x: 2, y: 2 });
    expect(ui).toEqual({ k: 'idle' });
    expect(action).toBeUndefined();
  });

  it('clicking an already-acted own unit is a no-op', () => {
    const mine = makeUnit({ id: 0, owner: 0, pos: { x: 2, y: 2 }, hasActed: true });
    const state = stateWith([mine]);
    const { ui } = onTileClick(state, { k: 'idle' }, { x: 2, y: 2 });
    expect(ui).toEqual({ k: 'idle' });
  });
});

describe('onTileClick — selected', () => {
  it('clicking a highlighted tile with no attackable enemies moves immediately', () => {
    const mine = makeUnit({ id: 0, owner: 0, pos: { x: 2, y: 2 } });
    const state = stateWith([mine]);
    const selected = { k: 'selected' as const, unitId: 0, reachable: [{ x: 3, y: 2 }, { x: 2, y: 2 }] };
    const { ui, action } = onTileClick(state, selected, { x: 3, y: 2 });
    expect(ui).toEqual({ k: 'idle' });
    expect(action).toEqual({ t: 'act', unitId: 0, to: { x: 3, y: 2 } });
  });

  it('clicking a highlighted tile adjacent to an enemy enters aiming', () => {
    const mine = makeUnit({ id: 0, owner: 0, pos: { x: 0, y: 0 } });
    const enemy = makeUnit({ id: 1, owner: 1, pos: { x: 2, y: 0 } });
    const state = stateWith([mine, enemy]);
    const reachable = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
    const selected = { k: 'selected' as const, unitId: 0, reachable };
    const { ui, action } = onTileClick(state, selected, { x: 1, y: 0 });
    expect(action).toBeUndefined();
    expect(ui).toEqual({ k: 'aiming', unitId: 0, dest: { x: 1, y: 0 }, targets: [1], reachable });
  });

  it('clicking a non-highlighted tile is a no-op', () => {
    const mine = makeUnit({ id: 0, owner: 0, pos: { x: 0, y: 0 } });
    const state = stateWith([mine]);
    const selected = { k: 'selected' as const, unitId: 0, reachable: [{ x: 0, y: 0 }] };
    const { ui, action } = onTileClick(state, selected, { x: 5, y: 5 });
    expect(ui).toEqual(selected);
    expect(action).toBeUndefined();
  });
});

describe('onTileClick — aiming', () => {
  it('clicking a highlighted target attacks', () => {
    const mine = makeUnit({ id: 0, owner: 0, pos: { x: 1, y: 0 } });
    const enemy = makeUnit({ id: 1, owner: 1, pos: { x: 2, y: 0 } });
    const state = stateWith([mine, enemy]);
    const aiming = {
      k: 'aiming' as const, unitId: 0, dest: { x: 1, y: 0 }, targets: [1], reachable: [{ x: 1, y: 0 }],
    };
    const { ui, action } = onTileClick(state, aiming, { x: 2, y: 0 });
    expect(ui).toEqual({ k: 'idle' });
    expect(action).toEqual({ t: 'act', unitId: 0, to: { x: 1, y: 0 }, targetId: 1 });
  });

  it('clicking elsewhere commits the move without an attack', () => {
    const mine = makeUnit({ id: 0, owner: 0, pos: { x: 1, y: 0 } });
    const enemy = makeUnit({ id: 1, owner: 1, pos: { x: 2, y: 0 } });
    const state = stateWith([mine, enemy]);
    const aiming = {
      k: 'aiming' as const, unitId: 0, dest: { x: 1, y: 0 }, targets: [1], reachable: [{ x: 1, y: 0 }],
    };
    const { ui, action } = onTileClick(state, aiming, { x: 7, y: 7 });
    expect(ui).toEqual({ k: 'idle' });
    expect(action).toEqual({ t: 'act', unitId: 0, to: { x: 1, y: 0 } });
  });
});

describe('onTileClick — locked states', () => {
  it('ignores clicks during aiTurn', () => {
    const state = stateWith([]);
    const { ui, action } = onTileClick(state, { k: 'aiTurn' }, { x: 0, y: 0 });
    expect(ui).toEqual({ k: 'aiTurn' });
    expect(action).toBeUndefined();
  });

  it('ignores clicks once the game is over', () => {
    const state = stateWith([]);
    const over = { k: 'over' as const, result: 'p0' as const };
    const { ui, action } = onTileClick(state, over, { x: 0, y: 0 });
    expect(ui).toEqual(over);
    expect(action).toBeUndefined();
  });
});

describe('onCancel', () => {
  it('steps aiming back to selected, preserving the reachable set', () => {
    const aiming = {
      k: 'aiming' as const, unitId: 0, dest: { x: 1, y: 0 }, targets: [1], reachable: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
    };
    expect(onCancel(aiming)).toEqual({ k: 'selected', unitId: 0, reachable: aiming.reachable });
  });

  it('steps selected back to idle', () => {
    expect(onCancel({ k: 'selected', unitId: 0, reachable: [] })).toEqual({ k: 'idle' });
  });

  it('leaves idle, aiTurn, and over unchanged', () => {
    expect(onCancel({ k: 'idle' })).toEqual({ k: 'idle' });
    expect(onCancel({ k: 'aiTurn' })).toEqual({ k: 'aiTurn' });
    expect(onCancel({ k: 'over', result: 'draw' })).toEqual({ k: 'over', result: 'draw' });
  });
});
