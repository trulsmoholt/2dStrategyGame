import type { Action, GameState, Pos, Unit, UnitId } from '../sim/index';
import { attackableFrom, chebyshev, expectedDamage, reachableTiles, UNIT_STATS } from '../sim/index';

// The AI never merges — deliberately, and measured. See SPEC.md §4: the
// heuristics tried cost it ~15 percentage points of win rate over 300 seeds,
// because merging's cost (a full turn of offence, plus a body's worth of zone
// of control) is immediate while its payoff (taking one counterattack per turn
// instead of two) is positional and deferred. A one-ply greedy scorer cannot
// see that, and SPEC.md §6 rules out lookahead. `applyExpected` below still
// handles the action, so nothing breaks if that changes.

// 0 if the kill lands (no counter possible from a dead unit) or the
// attacker ends up out of the target's range; otherwise the target's
// expected retaliation damage.
function expectedCounter(target: Unit, attacker: Unit, dest: Pos): number {
  const dmg = expectedDamage(attacker);
  if (dmg >= target.hp) return 0;
  const targetRange = UNIT_STATS[target.type].range;
  return chebyshev(dest, target.pos) <= targetRange ? expectedDamage(target) : 0;
}

function countAdjacentEnemies(state: GameState, mover: Unit, dest: Pos): number {
  return state.units.filter(u => u.owner !== mover.owner && chebyshev(dest, u.pos) <= 1).length;
}

function scoreAttack(state: GameState, attacker: Unit, dest: Pos, target: Unit): number {
  const dmg = expectedDamage(attacker);
  const killBonus = dmg >= target.hp ? 1 : 0;
  const counter = expectedCounter(target, attacker, dest);
  const adjacent = countAdjacentEnemies(state, attacker, dest);
  return 100 * Math.min(dmg, target.hp) + 400 * killBonus - 80 * counter - 5 * adjacent;
}

function chooseUnitAction(state: GameState, unit: Unit): Action {
  const destinations = reachableTiles(state, unit.id);

  // Fight phase: best (destination, target) pair by score. `destinations`
  // and `attackableFrom` are both sorted ascending, so a strict `>` keeps
  // the first-seen (lowest dest, then lowest target id) on ties.
  let bestScore = -Infinity;
  let bestTo: Pos | null = null;
  let bestTargetId: UnitId | null = null;

  for (const to of destinations) {
    for (const targetId of attackableFrom(state, unit.id, to)) {
      const target = state.units.find(u => u.id === targetId)!;
      const score = scoreAttack(state, unit, to, target);
      if (score > bestScore) {
        bestScore = score;
        bestTo = to;
        bestTargetId = targetId;
      }
    }
  }

  if (bestTo !== null && bestTargetId !== null) {
    return { t: 'act', unitId: unit.id, to: bestTo, targetId: bestTargetId };
  }

  // Seek phase: no attack is reachable this turn. Move toward the nearest
  // living enemy; ties broken by lowest (y, x) since `destinations` is sorted.
  const enemies = state.units.filter(u => u.owner !== unit.owner);
  let bestDist = Infinity;
  let bestDest: Pos = unit.pos;
  for (const to of destinations) {
    const dist = enemies.reduce((min, e) => Math.min(min, chebyshev(to, e.pos)), Infinity);
    if (dist < bestDist) {
      bestDist = dist;
      bestDest = to;
    }
  }

  if (bestDest.x === unit.pos.x && bestDest.y === unit.pos.y) {
    return { t: 'wait', unitId: unit.id };
  }
  return { t: 'act', unitId: unit.id, to: bestDest };
}

function nextActor(state: GameState): Unit | undefined {
  return state.units
    .filter(u => u.owner === state.current && !u.hasActed)
    .sort((a, b) => a.id - b.id)[0];
}

// Approximates the effect of one action using expected (unrolled) damage,
// purely to sequence decisions within a single chooseTurn call. This is
// never applied to the real game and never touches state.rng.
function applyExpected(state: GameState, action: Action): GameState {
  if (action.t === 'wait') {
    return {
      ...state,
      units: state.units.map(u => (u.id === action.unitId ? { ...u, hasActed: true } : u)),
    };
  }

  if (action.t === 'merge') {
    const survivor = state.units.find(u => u.id === action.unitId)!;
    const absorbed = state.units.find(u => u.id === action.absorbId)!;
    return {
      ...state,
      units: state.units
        .filter(u => u.id !== absorbed.id)
        .map(u => (u.id === survivor.id
          ? { ...u, hp: u.hp + absorbed.hp, stack: u.stack + absorbed.stack, hasActed: true }
          : u)),
    };
  }

  if (action.t === 'act') {
    const attacker = state.units.find(u => u.id === action.unitId)!;
    let units = state.units.map(u => (u.id === action.unitId ? { ...u, pos: action.to } : u));

    if (action.targetId !== undefined) {
      const target = state.units.find(u => u.id === action.targetId)!;
      const targetHp = target.hp - expectedDamage(attacker);

      if (targetHp <= 0) {
        units = units.filter(u => u.id !== action.targetId);
      } else {
        units = units.map(u => (u.id === action.targetId ? { ...u, hp: targetHp } : u));
        const targetRange = UNIT_STATS[target.type].range;
        if (chebyshev(action.to, target.pos) <= targetRange) {
          const attackerHp = attacker.hp - expectedDamage(target);
          units = attackerHp <= 0
            ? units.filter(u => u.id !== action.unitId)
            : units.map(u => (u.id === action.unitId ? { ...u, hp: attackerHp } : u));
        }
      }
    }

    units = units.map(u => (u.id === action.unitId ? { ...u, hasActed: true } : u));
    return { ...state, units };
  }

  return state;
}

export function chooseAction(state: GameState): Action {
  const unit = nextActor(state);
  return unit ? chooseUnitAction(state, unit) : { t: 'endTurn' };
}

export function chooseTurn(state: GameState): Action[] {
  const actions: Action[] = [];
  let working = state;

  let unit = nextActor(working);
  while (unit) {
    const action = chooseUnitAction(working, unit);
    actions.push(action);
    working = applyExpected(working, action);
    unit = nextActor(working);
  }

  actions.push({ t: 'endTurn' });
  return actions;
}
