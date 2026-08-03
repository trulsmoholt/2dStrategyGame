import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('import boundary', () => {
  it('src/ai/ai.ts imports only from src/sim/index', () => {
    const content = readFileSync(join(__dirname, '..', 'ai.ts'), 'utf8');
    const importRe = /(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]/g;
    const specs = [...content.matchAll(importRe)].map(m => m[1]!);

    expect(specs.length).toBeGreaterThan(0);
    for (const spec of specs) {
      expect(spec === '../sim/index' || spec === '../sim').toBe(true);
    }
  });
});
