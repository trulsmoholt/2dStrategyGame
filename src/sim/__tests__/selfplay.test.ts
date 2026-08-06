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
        const terrain = terrainAt(final.map, u.pos);
        expect(terrain === 'plain' || terrain === 'rough').toBe(true);
      }

      // determinism under re-run: same seed, same log
      const rerun = playOut(newGame(seed), chooseAction);
      expect(rerun.log).toEqual(log);

      results.push(final.result!);
    }

    const draws = results.filter(r => r === 'draw').length;
    expect(draws).toBeLessThanOrEqual(10);

    // MAP_NORTHERN_NORWAY isn't 180deg-rotationally symmetric (unlike
    // MAP_STANDARD), so "both sides win at least once" is no longer a
    // meaningful fairness check — a single win for the weaker side would
    // pass it while a real regression that skews the AI further could
    // still slip through. A win-rate band is the replacement: it still
    // catches a broken seek/fight phase (which would collapse toward 0%,
    // 100%, or all-draws) without asserting exact balance, which is
    // ROADMAP.md's job for asymmetric rosters, not this map's terrain.
    // Measured empirically at ~38% over both a 100- and a 300-seed sample
    // (0 draws either way); the band below gives real margin around that.
    const p0WinRate = results.filter(r => r === 'p0').length / results.length;
    expect(p0WinRate).toBeGreaterThan(0.2);
    expect(p0WinRate).toBeLessThan(0.6);
  });
});
