import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SIM_DIR = join(__dirname, '..');

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__') continue;   // tests may cross module boundaries; production code may not
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listTsFiles(full));
    } else if (entry.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('import boundary', () => {
  it('no production file under src/sim imports from src/render or src/ai', () => {
    const importRe = /(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]/g;
    const offenders: string[] = [];

    for (const file of listTsFiles(SIM_DIR)) {
      const content = readFileSync(file, 'utf8');
      for (const match of content.matchAll(importRe)) {
        const spec = match[1]!;
        const segments = spec.split('/');
        if (segments.includes('render') || segments.includes('ai')) {
          offenders.push(`${file}: imports '${spec}'`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
