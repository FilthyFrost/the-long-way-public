/**
 * Gate L0: the simulation core must stay free of rendering and browser dependencies,
 * so it keeps running in Node tests and in workers.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('core purity', () => {
  const files = walk(path.join(ROOT, 'src/core'));
  it('has files', () => expect(files.length).toBeGreaterThan(5));
  for (const f of files) {
    it(`${path.relative(ROOT, f)} has no three / DOM / game imports`, () => {
      const src = fs.readFileSync(f, 'utf8');
      expect(src).not.toMatch(/from\s+['"]three/);
      expect(src).not.toMatch(/from\s+['"][^'"]*\/game\//);
      expect(src).not.toMatch(/\b(document|window|navigator|requestAnimationFrame)\s*[.(]/);
    });
  }
});
