import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RENDER_DIR = join(__dirname, '..');
const ALLOWED_EXTERNAL = new Set(['../sim/index', '../ai/ai']);

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
  it('src/render only reaches outside itself via src/sim/index and src/ai/ai', () => {
    const importRe = /(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]/g;
    const offenders: string[] = [];

    for (const file of listTsFiles(RENDER_DIR)) {
      const content = readFileSync(file, 'utf8');
      for (const match of content.matchAll(importRe)) {
        const spec = match[1]!;
        if (!spec.startsWith('../')) continue;   // same-directory imports are unrestricted
        if (!ALLOWED_EXTERNAL.has(spec)) {
          offenders.push(`${file}: imports '${spec}'`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
