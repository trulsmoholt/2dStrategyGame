import type { Action, GameState, Pos } from '../sim/index';
import { replay } from '../sim/index';

export interface SavedGame {
  readonly seed: number;
  readonly log: Action[];
}

export function serializeGame(seed: number, log: readonly Action[]): string {
  return JSON.stringify({ seed, log }, null, 2);
}

function isPos(v: unknown): v is Pos {
  return (
    typeof v === 'object' && v !== null &&
    typeof (v as Pos).x === 'number' && typeof (v as Pos).y === 'number'
  );
}

function parseAction(v: unknown, index: number): Action {
  if (typeof v !== 'object' || v === null) {
    throw new Error(`parseSavedGame: log[${index}] is not an object`);
  }
  const t = (v as { t?: unknown }).t;

  switch (t) {
    case 'act': {
      const a = v as { unitId?: unknown; to?: unknown; targetId?: unknown };
      if (typeof a.unitId !== 'number') {
        throw new Error(`parseSavedGame: log[${index}] ('act') missing numeric unitId`);
      }
      if (!isPos(a.to)) {
        throw new Error(`parseSavedGame: log[${index}] ('act') missing valid 'to' position`);
      }
      if (a.targetId !== undefined && typeof a.targetId !== 'number') {
        throw new Error(`parseSavedGame: log[${index}] ('act') has a non-numeric targetId`);
      }
      return a.targetId === undefined
        ? { t: 'act', unitId: a.unitId, to: a.to }
        : { t: 'act', unitId: a.unitId, to: a.to, targetId: a.targetId };
    }

    case 'wait': {
      const a = v as { unitId?: unknown };
      if (typeof a.unitId !== 'number') {
        throw new Error(`parseSavedGame: log[${index}] ('wait') missing numeric unitId`);
      }
      return { t: 'wait', unitId: a.unitId };
    }

    case 'merge': {
      const a = v as { unitId?: unknown; absorbId?: unknown };
      if (typeof a.unitId !== 'number') {
        throw new Error(`parseSavedGame: log[${index}] ('merge') missing numeric unitId`);
      }
      if (typeof a.absorbId !== 'number') {
        throw new Error(`parseSavedGame: log[${index}] ('merge') missing numeric absorbId`);
      }
      return { t: 'merge', unitId: a.unitId, absorbId: a.absorbId };
    }

    case 'endTurn':
      return { t: 'endTurn' };

    default:
      throw new Error(`parseSavedGame: log[${index}] has unknown action type ${JSON.stringify(t)}`);
  }
}

export function parseSavedGame(text: string): SavedGame {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('parseSavedGame: not valid JSON');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('parseSavedGame: expected a JSON object with seed and log');
  }
  const { seed, log } = parsed as { seed?: unknown; log?: unknown };

  if (typeof seed !== 'number') {
    throw new Error('parseSavedGame: missing numeric seed');
  }
  if (!Array.isArray(log)) {
    throw new Error('parseSavedGame: missing log array');
  }

  return { seed, log: log.map((entry, index) => parseAction(entry, index)) };
}

export function loadSavedGame(text: string): GameState {
  const saved = parseSavedGame(text);
  return replay(saved.seed, saved.log);
}
