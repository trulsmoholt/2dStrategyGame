import { describe, expect, it } from 'vitest';
import type { GameMap, GameState, Terrain, Unit } from '../../sim/index';
import { seedRng } from '../../sim/index';
import { mergeCandidates, onCancel, onMerge, onTileClick, pixelToTile } from '../ui';

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

  it('clicking a non-highlighted tile deselects', () => {
    const mine = makeUnit({ id: 0, owner: 0, pos: { x: 0, y: 0 } });
    const state = stateWith([mine]);
    const selected = { k: 'selected' as const, unitId: 0, reachable: [{ x: 0, y: 0 }] };
    const { ui, action } = onTileClick(state, selected, { x: 5, y: 5 });
    expect(ui).toEqual({ k: 'idle' });
    expect(action).toBeUndefined();
  });

  it('clicking a wall deselects', () => {
    const mine = makeUnit({ id: 0, owner: 0, pos: { x: 0, y: 0 } });
    const map = flatMap(8, 8);
    const wallState: GameState = { ...stateWith([mine]), map: { ...map, tiles: map.tiles.map((t, i) => (i === 1 ? 'wall' : t)) } };
    const selected = { k: 'selected' as const, unitId: 0, reachable: [{ x: 0, y: 0 }] };
    const { ui, action } = onTileClick(wallState, selected, { x: 1, y: 0 });
    expect(ui).toEqual({ k: 'idle' });
    expect(action).toBeUndefined();
  });

  it('clicking the selected unit itself deselects, without moving or spending its turn', () => {
    const mine = makeUnit({ id: 0, owner: 0, pos: { x: 0, y: 0 } });
    const state = stateWith([mine]);
    const selected = { k: 'selected' as const, unitId: 0, reachable: [{ x: 0, y: 0 }, { x: 1, y: 0 }] };
    const { ui, action } = onTileClick(state, selected, { x: 0, y: 0 });
    expect(ui).toEqual({ k: 'idle' });
    expect(action).toBeUndefined();
  });

  it('clicking the selected unit itself enters aiming when an enemy is in range from here', () => {
    const mine = makeUnit({ id: 0, owner: 0, pos: { x: 0, y: 0 } });
    const enemy = makeUnit({ id: 1, owner: 1, pos: { x: 1, y: 0 } });
    const state = stateWith([mine, enemy]);
    const selected = { k: 'selected' as const, unitId: 0, reachable: [{ x: 0, y: 0 }] };
    const { ui, action } = onTileClick(state, selected, { x: 0, y: 0 });
    expect(action).toBeUndefined();
    expect(ui).toEqual({ k: 'aiming', unitId: 0, dest: { x: 0, y: 0 }, targets: [1], reachable: selected.reachable });
  });

  it('clicking a living enemy directly (not via its own tile first) deselects, even if it is in range', () => {
    const mine = makeUnit({ id: 0, owner: 0, type: 'ranged', pos: { x: 0, y: 0 } });
    const enemy = makeUnit({ id: 1, owner: 1, pos: { x: 2, y: 0 } });
    const state = stateWith([mine, enemy]);
    const selected = { k: 'selected' as const, unitId: 0, reachable: [{ x: 0, y: 0 }] };
    const { ui, action } = onTileClick(state, selected, { x: 2, y: 0 });
    expect(ui).toEqual({ k: 'idle' });
    expect(action).toBeUndefined();
  });

  it('clicking a living enemy out of range from the current tile deselects', () => {
    const mine = makeUnit({ id: 0, owner: 0, type: 'melee', pos: { x: 0, y: 0 } });
    const enemy = makeUnit({ id: 1, owner: 1, pos: { x: 5, y: 0 } });
    const state = stateWith([mine, enemy]);
    const selected = { k: 'selected' as const, unitId: 0, reachable: [{ x: 0, y: 0 }, { x: 1, y: 0 }] };
    const { ui, action } = onTileClick(state, selected, { x: 5, y: 0 });
    expect(ui).toEqual({ k: 'idle' });
    expect(action).toBeUndefined();
  });

  it('clicking an ally deselects', () => {
    const mine = makeUnit({ id: 0, owner: 0, pos: { x: 0, y: 0 } });
    const ally = makeUnit({ id: 2, owner: 0, pos: { x: 4, y: 4 } });
    const state = stateWith([mine, ally]);
    const selected = { k: 'selected' as const, unitId: 0, reachable: [{ x: 0, y: 0 }] };
    const { ui, action } = onTileClick(state, selected, { x: 4, y: 4 });
    expect(ui).toEqual({ k: 'idle' });
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

  it('steps merging back to selected, preserving the reachable set', () => {
    const merging = {
      k: 'merging' as const, unitId: 0, candidates: [1], reachable: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
    };
    expect(onCancel(merging)).toEqual({ k: 'selected', unitId: 0, reachable: merging.reachable });
  });
});

describe('merging', () => {
  // Two adjacent, un-acted, same-type friendly units.
  const mine = makeUnit({ id: 0, owner: 0, pos: { x: 1, y: 1 } });
  const ally = makeUnit({ id: 1, owner: 0, pos: { x: 2, y: 1 } });
  const selected = { k: 'selected' as const, unitId: 0, reachable: [{ x: 1, y: 1 }] };

  it('onMerge enters merging with the legal partners', () => {
    const state = stateWith([mine, ally]);
    expect(onMerge(state, selected)).toEqual({
      k: 'merging', unitId: 0, candidates: [1], reachable: selected.reachable,
    });
  });

  it('onMerge is a no-op when the selection has no partner', () => {
    const state = stateWith([mine]);
    expect(onMerge(state, selected)).toBe(selected);
  });

  it('onMerge is a no-op from any state other than selected', () => {
    const state = stateWith([mine, ally]);
    expect(onMerge(state, { k: 'idle' })).toEqual({ k: 'idle' });
    expect(onMerge(state, { k: 'aiTurn' })).toEqual({ k: 'aiTurn' });
  });

  it('clicking a highlighted partner emits the merge, with the selected unit surviving', () => {
    const state = stateWith([mine, ally]);
    const merging = { k: 'merging' as const, unitId: 0, candidates: [1], reachable: [] };
    const { ui, action } = onTileClick(state, merging, { x: 2, y: 1 });
    expect(ui).toEqual({ k: 'idle' });
    expect(action).toEqual({ t: 'merge', unitId: 0, absorbId: 1 });
  });

  it('clicking anything else deselects without merging', () => {
    const state = stateWith([mine, ally]);
    const merging = { k: 'merging' as const, unitId: 0, candidates: [1], reachable: [] };
    for (const tile of [{ x: 5, y: 5 }, { x: 1, y: 1 }]) {
      const { ui, action } = onTileClick(state, merging, tile);
      expect(ui).toEqual({ k: 'idle' });
      expect(action).toBeUndefined();
    }
  });

  it('mergeCandidates drives the panel button for selected and merging only', () => {
    const state = stateWith([mine, ally]);
    expect(mergeCandidates(state, selected)).toEqual([1]);
    expect(mergeCandidates(state, { k: 'merging', unitId: 0, candidates: [1], reachable: [] })).toEqual([1]);
    expect(mergeCandidates(state, { k: 'idle' })).toEqual([]);
    expect(mergeCandidates(stateWith([mine]), selected)).toEqual([]);
  });
});
