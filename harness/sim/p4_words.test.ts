import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The words of the buttons (docs/V3/plan/prompts.md §五, the user's "一个键一个词…不要括号里的解释、不要长句"): every
 * action line the game's code writes as plain words — `{ keys: [...], text: '...' }` — is one verb, or a verb and a
 * thing, with no explanation in brackets, after a colon or after a "·"; what cannot be done is not written as a line
 * (an off action keeps a why of a few words instead).
 */
const ROOT = join(__dirname, '../../src/game/modcar');

function files(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) files(p, out);
    else if (p.endsWith('.ts') && !/dev(Tab|Panel|Lab|Proving|Tools)|viewer/.test(n)) out.push(p);
  }
  return out;
}

/** each action written in plain words in the code: its text, and its why when it has one */
function actions(): { file: string; text: string; why: string | null; off: boolean }[] {
  const out: { file: string; text: string; why: string | null; off: boolean }[] = [];
  const re = /\{\s*keys:\s*[^}]*?text:\s*'([^']*)'([^}]*)\}/g;
  for (const f of files(ROOT)) {
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(re)) {
      const rest = m[2];
      const why = /why:\s*'([^']*)'/.exec(rest)?.[1] ?? null;
      out.push({ file: f.slice(ROOT.length + 1), text: m[1], why, off: /off:\s*true/.test(rest) });
    }
  }
  return out;
}

describe('the words of the buttons (docs/V3/plan/prompts.md §五)', () => {
  const all = actions();
  it('there are action lines to look at', () => {
    expect(all.length).toBeGreaterThan(60);
  });
  it('no explanation in brackets, after a colon or after a "·"', () => {
    const bad = all.filter((a) => /[（(：]| · /.test(a.text.replace(/<[^>]+>/g, ''))).map((a) => `${a.file}: ${a.text}`);
    expect(bad).toEqual([]);
  });
  it('a few characters each (a verb, or a verb and a thing)', () => {
    const long = all.filter((a) => a.text.replace(/<[^>]+>/g, '').length > 8).map((a) => `${a.file}: ${a.text}`);
    expect(long).toEqual([]);
  });
  it('why, when it cannot be done, in a few words', () => {
    const long = all.filter((a) => a.why && a.why.length > 10).map((a) => `${a.file}: ${a.why}`);
    expect(long).toEqual([]);
  });
});
