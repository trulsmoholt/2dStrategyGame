import type { Unit, UnitTypeId } from './types';

export interface UnitStats {
  readonly maxHp: number;
  readonly power: number;
  readonly mp: number;       // movement points (tiles, 8-way, uniform cost)
  readonly range: number;    // Chebyshev attack range
  readonly glyph: string;    // renderer hint only
}

export const UNIT_STATS: Record<UnitTypeId, UnitStats> = {
  melee:  { maxHp: 10, power: 4, mp: 3, range: 1, glyph: 'M' },
  ranged: { maxHp:  6, power: 3, mp: 2, range: 2, glyph: 'R' },
};

// The two stats merging scales (SPEC.md §9.2). Reading UNIT_STATS[u.type].maxHp
// or .power for a *unit* anywhere outside this file is a bug — it silently
// ignores `stack`. mp, range and glyph are unaffected by merging, so those are
// still read straight from the table.
export function unitMaxHp(u: Unit): number {
  return UNIT_STATS[u.type].maxHp * u.stack;
}

export function unitPower(u: Unit): number {
  return UNIT_STATS[u.type].power * u.stack;
}

export type MergeKind = 'stack';

// The single dispatch point for "can these two combine, and into what". Type
// compatibility only — callers own the situational rules (ownership,
// adjacency, hasActed, MAX_STACK). Kept here rather than inlined as
// `a.type === b.type` at the call site so that cargo (SPEC.md §9.3) can add a
// 'load' result without a UnitTypeId comparison leaking outside this file.
export function mergeKind(a: Unit, b: Unit): MergeKind | null {
  return a.type === b.type ? 'stack' : null;
}
