import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? files(join(dir, d.name)) : d.name.endsWith('.ts') ? [join(dir, d.name)] : [],
  );
}

describe('engine purity', () => {
  it('src/rules, src/run and src/ai import nothing from src/ui, React or the DOM', () => {
    for (const file of ['src/rules', 'src/run', 'src/ai'].flatMap(files)) {
      const src = readFileSync(file, 'utf8');
      const imports = [...src.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]!);
      for (const spec of imports) {
        expect(spec, file).not.toMatch(/(^|\/)ui(\/|$)|^react/);
      }
      expect(src, file).not.toMatch(/\b(document|window|localStorage|Math\.random|Date\.now)\b/);
    }
  });
});
