import type { Action, GameState } from './types';
import { seedRng } from './rng';
import { parseMap } from './map';
import { MAP_NORTHERN_NORWAY } from './maps';
import { reduce, checkResult } from './reduce';

export { checkResult };

export function newGame(seed: number): GameState {
  const { map, units } = parseMap(MAP_NORTHERN_NORWAY);
  const state: GameState = {
    map,
    units,
    current: 0,
    turn: 1,
    rng: seedRng(seed),
    result: null,
  };
  return { ...state, result: checkResult(state) };
}

export function playOut(
  state: GameState, choose: (s: GameState) => Action,
): { final: GameState; log: Action[] } {
  const log: Action[] = [];
  let current = state;
  while (current.result === null) {
    const action = choose(current);
    current = reduce(current, action);
    log.push(action);
  }
  return { final: current, log };
}

export function replay(seed: number, log: readonly Action[]): GameState {
  let state = newGame(seed);
  for (const action of log) {
    state = reduce(state, action);
  }
  return state;
}
