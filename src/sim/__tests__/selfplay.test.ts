import { describe, expect, it } from 'vitest';
import type { GameResult } from '../types';
import { MAX_TURNS } from '../types';
import { newGame, playOut, replay } from '../game';
import { terrainAt } from '../map';
import { chooseAction } from '../../ai/ai';

describe('self-play', () => {
  it('100 seeds: every game terminates cleanly, deterministically, with sane invariants', () => {
    const results: GameResult[] = [];

    for (let seed = 0; seed < 100; seed++) {
      const { final, log } = playOut(newGame(seed), chooseAction);

      expect(final.result).not.toBeNull();
      expect(final.turn).toBeLessThanOrEqual(MAX_TURNS + 1);
      expect(replay(seed, log)).toEqual(final);
      expect(log.length).toBeGreaterThan(10);

      // never two units on a tile
      expect(new Set(final.units.map(u => `${u.pos.x},${u.pos.y}`)).size)
        .toBe(final.units.length);
      for (const u of final.units) {
        expect(u.hp).toBeGreaterThan(0);                        // dead units are removed
        expect(terrainAt(final.map, u.pos)).toBe('plain');
      }

      // determinism under re-run: same seed, same log
      const rerun = playOut(newGame(seed), chooseAction);
      expect(rerun.log).toEqual(log);

      results.push(final.result!);
    }

    const draws = results.filter(r => r === 'draw').length;
    expect(draws).toBeLessThanOrEqual(10);

    expect(results.includes('p0')).toBe(true);
    expect(results.includes('p1')).toBe(true);
  });
});
