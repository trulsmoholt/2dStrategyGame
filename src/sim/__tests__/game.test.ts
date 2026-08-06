import { describe, expect, it } from 'vitest';
import type { Action, GameState } from '../types';
import { newGame, playOut, replay } from '../game';
import { legalActions } from '../actions';
import { terrainAt } from '../map';

describe('newGame', () => {
  it('builds a valid initial state', () => {
    const state = newGame(1);
    expect(state.units.length).toBe(10);
    expect(state.units.filter(u => u.owner === 0).length).toBe(5);
    expect(state.units.filter(u => u.owner === 1).length).toBe(5);
    expect(state.current).toBe(0);
    expect(state.turn).toBe(1);
    expect(state.result).toBeNull();
    for (const u of state.units) {
      expect(terrainAt(state.map, u.pos)).toBe('plain');
    }
  });

  it('is deterministic per seed (same rng, same units)', () => {
    const a = newGame(42);
    const b = newGame(42);
    expect(a).toEqual(b);
  });

  it('legalActions always has at least one action while the game is running', () => {
    const state = newGame(1);
    expect(legalActions(state).length).toBeGreaterThanOrEqual(1);
    expect(legalActions(state).some(a => a.t === 'endTurn')).toBe(true);
  });

  it('defaults to the Northern Norway map when mapId is omitted', () => {
    expect(newGame(1)).toEqual(newGame(1, 'northern-norway'));
  });

  it('throws for an unknown map id', () => {
    expect(() => newGame(1, 'no-such-map')).toThrow(/unknown map id/);
  });
});

// A trivial, RNG-free policy: wait out every unit, then end turn. Exercises
// newGame/reduce/playOut/replay end-to-end without depending on src/ai.
function waitItOut(state: GameState): Action {
  const unit = state.units.find(u => u.owner === state.current && !u.hasActed);
  return unit ? { t: 'wait', unitId: unit.id } : { t: 'endTurn' };
}

describe('playOut / replay', () => {
  it('a game where nobody acts runs to the turn cap and ends in a draw', () => {
    const { final, log } = playOut(newGame(7), waitItOut);
    expect(final.result).toBe('draw');
    expect(final.turn).toBe(51);
    expect(log.length).toBeGreaterThan(0);
  });

  it('replay(seed, log) reproduces the final state exactly', () => {
    const { final, log } = playOut(newGame(7), waitItOut);
    expect(replay(7, log)).toEqual(final);
  });
});
