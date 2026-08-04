import { describe, expect, it } from 'vitest';
import { newGame, playOut } from '../../sim/index';
import { chooseAction } from '../../ai/ai';
import { loadSavedGame, parseSavedGame, serializeGame } from '../replay';

describe('serializeGame / parseSavedGame round trip', () => {
  it('round-trips a seed and action log through JSON', () => {
    const { log } = playOut(newGame(7), chooseAction);
    const text = serializeGame(7, log);
    expect(parseSavedGame(text)).toEqual({ seed: 7, log });
  });
});

describe('loadSavedGame', () => {
  it('reconstructs the same final state as replaying the log directly', () => {
    const { final, log } = playOut(newGame(42), chooseAction);
    const text = serializeGame(42, log);
    expect(loadSavedGame(text)).toEqual(final);
  });

  it('propagates reduce\'s error for a structurally-valid but illegal action', () => {
    const text = JSON.stringify({ seed: 1, log: [{ t: 'wait', unitId: 9999 }] });
    expect(() => loadSavedGame(text)).toThrow(/no unit with id 9999/);
  });
});

describe('parseSavedGame validation', () => {
  it('rejects invalid JSON', () => {
    expect(() => parseSavedGame('not json')).toThrow(/not valid JSON/);
  });

  it('rejects a JSON value that is not an object', () => {
    expect(() => parseSavedGame('42')).toThrow(/expected a JSON object/);
  });

  it('rejects a missing seed', () => {
    expect(() => parseSavedGame(JSON.stringify({ log: [] }))).toThrow(/numeric seed/);
  });

  it('rejects a non-numeric seed', () => {
    expect(() => parseSavedGame(JSON.stringify({ seed: '1', log: [] }))).toThrow(/numeric seed/);
  });

  it('rejects a missing log array', () => {
    expect(() => parseSavedGame(JSON.stringify({ seed: 1 }))).toThrow(/log array/);
  });

  it('rejects a log entry with an unknown action type', () => {
    const text = JSON.stringify({ seed: 1, log: [{ t: 'flee' }] });
    expect(() => parseSavedGame(text)).toThrow(/unknown action type/);
  });

  it('rejects an "act" entry missing unitId', () => {
    const text = JSON.stringify({ seed: 1, log: [{ t: 'act', to: { x: 0, y: 0 } }] });
    expect(() => parseSavedGame(text)).toThrow(/missing numeric unitId/);
  });

  it('rejects an "act" entry missing a valid "to" position', () => {
    const text = JSON.stringify({ seed: 1, log: [{ t: 'act', unitId: 0 }] });
    expect(() => parseSavedGame(text)).toThrow(/missing valid 'to' position/);
  });

  it('rejects an "act" entry with a non-numeric targetId', () => {
    const text = JSON.stringify({
      seed: 1,
      log: [{ t: 'act', unitId: 0, to: { x: 0, y: 0 }, targetId: 'nope' }],
    });
    expect(() => parseSavedGame(text)).toThrow(/non-numeric targetId/);
  });

  it('rejects a "wait" entry missing unitId', () => {
    const text = JSON.stringify({ seed: 1, log: [{ t: 'wait' }] });
    expect(() => parseSavedGame(text)).toThrow(/missing numeric unitId/);
  });

  it('accepts a bare "endTurn" entry', () => {
    const text = JSON.stringify({ seed: 1, log: [{ t: 'endTurn' }] });
    expect(parseSavedGame(text)).toEqual({ seed: 1, log: [{ t: 'endTurn' }] });
  });
});
