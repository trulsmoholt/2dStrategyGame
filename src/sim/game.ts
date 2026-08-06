import type { Action, GameState, MapId } from './types';
import { seedRng } from './rng';
import { loadMap } from './map';
import { MAP_STANDARD_ID, getMapDef } from './maps';
import { reduce, checkResult } from './reduce';

export { checkResult };

export function newGame(seed: number, mapId: MapId = MAP_STANDARD_ID): GameState {
  const { map, units } = loadMap(getMapDef(mapId));
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

export function replay(
  seed: number, log: readonly Action[], mapId: MapId = MAP_STANDARD_ID,
): GameState {
  let state = newGame(seed, mapId);
  for (const action of log) {
    state = reduce(state, action);
  }
  return state;
}
