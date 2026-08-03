import type { GameState, Unit, UnitId } from './types';
import { DAMAGE_ROLL_MAX, DAMAGE_ROLL_MIN, MIN_DAMAGE } from './types';
import { UNIT_STATS } from './units';
import { chebyshev } from './map';
import { rollInt } from './rng';

export function expectedDamage(attacker: Unit): number {
  return UNIT_STATS[attacker.type].power;
}

export function resolveAttack(
  state: GameState, attackerId: UnitId, defenderId: UnitId,
): GameState {
  const attacker = state.units.find(u => u.id === attackerId);
  const defender = state.units.find(u => u.id === defenderId);
  if (!attacker) throw new Error(`resolveAttack: no attacker with id ${attackerId}`);
  if (!defender) throw new Error(`resolveAttack: no defender with id ${defenderId}`);

  const attackerStats = UNIT_STATS[attacker.type];
  const defenderStats = UNIT_STATS[defender.type];

  const [atkRoll, rngAfterAttack] = rollInt(state.rng, DAMAGE_ROLL_MIN, DAMAGE_ROLL_MAX);
  const dmg = Math.max(MIN_DAMAGE, attackerStats.power + atkRoll);
  const defenderHp = defender.hp - dmg;

  if (defenderHp <= 0) {
    return {
      ...state,
      units: state.units.filter(u => u.id !== defenderId),
      rng: rngAfterAttack,
    };
  }

  let units = state.units.map(u => (u.id === defenderId ? { ...u, hp: defenderHp } : u));
  let rng = rngAfterAttack;

  if (chebyshev(defender.pos, attacker.pos) <= defenderStats.range) {
    const [counterRoll, rngAfterCounter] = rollInt(rngAfterAttack, DAMAGE_ROLL_MIN, DAMAGE_ROLL_MAX);
    const counterDmg = Math.max(MIN_DAMAGE, defenderStats.power + counterRoll);
    const attackerHp = attacker.hp - counterDmg;
    rng = rngAfterCounter;
    units = attackerHp <= 0
      ? units.filter(u => u.id !== attackerId)
      : units.map(u => (u.id === attackerId ? { ...u, hp: attackerHp } : u));
  }

  return { ...state, units, rng };
}
