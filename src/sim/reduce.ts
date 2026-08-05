import type { Action, GameResult, GameState, Player } from './types';
import { MAX_TURNS } from './types';
import { reachableTiles } from './movement';
import { attackableFrom, canMerge } from './actions';
import { resolveAttack } from './combat';

export function checkResult(state: GameState): GameResult | null {
  const p0Alive = state.units.some(u => u.owner === 0);
  const p1Alive = state.units.some(u => u.owner === 1);
  if (!p0Alive && p1Alive) return 'p1';
  if (!p1Alive && p0Alive) return 'p0';
  if (!p0Alive && !p1Alive) return 'draw';
  if (state.turn > MAX_TURNS) return 'draw';
  return null;
}

export function reduce(state: GameState, action: Action): GameState {
  if (state.result !== null) {
    throw new Error('reduce: cannot act on a finished game');
  }

  switch (action.t) {
    case 'act': {
      const unit = state.units.find(u => u.id === action.unitId);
      if (!unit) throw new Error(`reduce: no unit with id ${action.unitId}`);
      if (unit.owner !== state.current) throw new Error('reduce: unit does not belong to the current player');
      if (unit.hasActed) throw new Error('reduce: unit has already acted this turn');

      const reachable = reachableTiles(state, unit.id);
      if (!reachable.some(p => p.x === action.to.x && p.y === action.to.y)) {
        throw new Error('reduce: destination is not reachable');
      }

      let next: GameState = {
        ...state,
        units: state.units.map(u => (u.id === unit.id ? { ...u, pos: action.to } : u)),
      };

      if (action.targetId !== undefined) {
        const targets = attackableFrom(next, unit.id, action.to);
        if (!targets.includes(action.targetId)) {
          throw new Error('reduce: target is not in range from the destination');
        }
        next = resolveAttack(next, unit.id, action.targetId);
      }

      if (next.units.some(u => u.id === unit.id)) {
        next = {
          ...next,
          units: next.units.map(u => (u.id === unit.id ? { ...u, hasActed: true } : u)),
        };
      }

      return { ...next, result: checkResult(next) };
    }

    case 'wait': {
      const unit = state.units.find(u => u.id === action.unitId);
      if (!unit) throw new Error(`reduce: no unit with id ${action.unitId}`);
      if (unit.owner !== state.current) throw new Error('reduce: unit does not belong to the current player');
      if (unit.hasActed) throw new Error('reduce: unit has already acted this turn');

      const next: GameState = {
        ...state,
        units: state.units.map(u => (u.id === unit.id ? { ...u, hasActed: true } : u)),
      };
      return { ...next, result: checkResult(next) };
    }

    case 'merge': {
      const survivor = state.units.find(u => u.id === action.unitId);
      const absorbed = state.units.find(u => u.id === action.absorbId);
      if (!survivor) throw new Error(`reduce: no unit with id ${action.unitId}`);
      if (!absorbed) throw new Error(`reduce: no unit with id ${action.absorbId}`);
      if (survivor.owner !== state.current) throw new Error('reduce: unit does not belong to the current player');
      if (!canMerge(survivor, absorbed)) throw new Error('reduce: units cannot be merged');

      // Both units are spent: the absorbed one is gone, the survivor has
      // acted. No RNG, and the survivor does not move.
      const merged = {
        ...survivor,
        hp: survivor.hp + absorbed.hp,
        stack: survivor.stack + absorbed.stack,
        hasActed: true,
      };
      const next: GameState = {
        ...state,
        units: state.units
          .filter(u => u.id !== absorbed.id)
          .map(u => (u.id === survivor.id ? merged : u)),
      };
      return { ...next, result: checkResult(next) };
    }

    case 'endTurn': {
      const current = state.current;
      const incoming: Player = current === 0 ? 1 : 0;

      const units = state.units.map(u => {
        if (u.owner === current) return { ...u, hasActed: true };
        if (u.owner === incoming) return { ...u, hasActed: false };
        return u;
      });

      const turn = incoming === 0 ? state.turn + 1 : state.turn;
      const next: GameState = { ...state, units, current: incoming, turn };
      return { ...next, result: checkResult(next) };
    }

    default: {
      const exhaustive: never = action;
      throw new Error(`reduce: unknown action ${JSON.stringify(exhaustive)}`);
    }
  }
}
