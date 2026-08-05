import type { Action, GameState, Pos, Unit, UnitId } from './types';
import { MAX_STACK } from './types';
import { UNIT_STATS, mergeKind } from './units';
import { chebyshev } from './map';
import { reachableTiles } from './movement';

export function attackableFrom(
  state: GameState, unitId: UnitId, from: Pos,
): UnitId[] {
  const unit = state.units.find(u => u.id === unitId);
  if (!unit) throw new Error(`attackableFrom: no unit with id ${unitId}`);
  const { range } = UNIT_STATS[unit.type];
  return state.units
    .filter(u => u.owner !== unit.owner && chebyshev(from, u.pos) <= range)
    .map(u => u.id)
    .sort((a, b) => a - b);
}

// Situational legality for a merge, on top of mergeKind's type dispatch:
// same owner, distinct, both un-acted, adjacent, and within the stack cap.
// `survivor` keeps its position, so the pair is legal in both directions.
export function canMerge(survivor: Unit, absorbed: Unit): boolean {
  return (
    survivor.id !== absorbed.id &&
    survivor.owner === absorbed.owner &&
    !survivor.hasActed && !absorbed.hasActed &&
    chebyshev(survivor.pos, absorbed.pos) === 1 &&
    mergeKind(survivor, absorbed) !== null &&
    survivor.stack + absorbed.stack <= MAX_STACK
  );
}

// Units `unitId` could absorb this turn, ascending. Ordering matters for AI
// determinism, same as attackableFrom.
export function mergeableWith(state: GameState, unitId: UnitId): UnitId[] {
  const unit = state.units.find(u => u.id === unitId);
  if (!unit) throw new Error(`mergeableWith: no unit with id ${unitId}`);
  return state.units
    .filter(other => canMerge(unit, other))
    .map(u => u.id)
    .sort((a, b) => a - b);
}

export function legalActions(state: GameState): Action[] {
  if (state.result !== null) return [];

  const actions: Action[] = [];
  const actors = state.units
    .filter(u => u.owner === state.current && !u.hasActed)
    .sort((a, b) => a.id - b.id);

  for (const unit of actors) {
    for (const to of reachableTiles(state, unit.id)) {
      for (const targetId of attackableFrom(state, unit.id, to)) {
        actions.push({ t: 'act', unitId: unit.id, to, targetId });
      }
      actions.push({ t: 'act', unitId: unit.id, to });
    }
    for (const absorbId of mergeableWith(state, unit.id)) {
      actions.push({ t: 'merge', unitId: unit.id, absorbId });
    }
    actions.push({ t: 'wait', unitId: unit.id });
  }

  actions.push({ t: 'endTurn' });
  return actions;
}
