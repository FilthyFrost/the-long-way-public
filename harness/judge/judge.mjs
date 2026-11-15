// Judge: compare measured metrics with the spec cards and keep the scoreboard.
//   node harness/judge/judge.mjs [--record "note"] [--strict]
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const recordIdx = args.indexOf('--record');
const note = recordIdx >= 0 ? args[recordIdx + 1] ?? '' : null;
const strict = args.includes('--strict');

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.json')) out.push(p);
  }
  return out;
}

const fmt = (v) => (v === null || v === undefined ? '—' : Math.abs(v) >= 100 ? v.toFixed(1) : Math.abs(v) >= 10 ? v.toFixed(2) : v.toFixed(3));
const cards = walk(path.join(ROOT, 'specs')).map((p) => JSON.parse(fs.readFileSync(p, 'utf8'))).filter((c) => c.metrics);
// a card may name the milestone from which it counts; before that it is reported but not gated
const stateFile = path.join(ROOT, 'loop/state.json');
const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : { stage: 'M0', stages: ['M0'] };
const active = (card) => !card.stage || state.stages.indexOf(card.stage) <= state.stages.indexOf(state.stage);
const result = { specs: {}, passed: 0, total: 0, missing: 0 };
const rows = [];
for (const card of cards.sort((a, b) => (a.system + a.id).localeCompare(b.system + b.id))) {
  const file = path.join(ROOT, 'loop/metrics', `${card.system}_${card.id}.json`);
  const measured = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).metrics : null;
  const spec = { title: card.title, passed: 0, total: 0, missing: 0, metrics: {}, stage: card.stage ?? null, active: active(card) };
  for (const [key, t] of Object.entries(card.metrics)) {
    const v = measured ? measured[key] : undefined;
    let status = 'pass';
    let miss = 0;
    if (v === undefined || v === null) status = measured ? 'fail' : 'missing';
    else {
      const span = t.min !== undefined && t.max !== undefined ? t.max - t.min : Math.max(Math.abs(t.max ?? t.min ?? 1), 1e-9);
      if (t.min !== undefined && v < t.min) { status = 'fail'; miss = (t.min - v) / span; }
      if (t.max !== undefined && v > t.max) { status = 'fail'; miss = (v - t.max) / span; }
    }
    if (!spec.active) status = status === 'pass' ? 'early' : 'later';
    else {
      spec.total++;
      if (status === 'pass') spec.passed++;
      if (status === 'missing') spec.missing++;
    }
    spec.metrics[key] = { value: v ?? null, min: t.min ?? null, max: t.max ?? null, status, miss: Math.round(miss * 1000) / 1000 };
    const range = `${t.min ?? ''}…${t.max ?? ''}`;
    const tag = status === 'pass' ? '  ok ' : status === 'missing' ? '  ?? ' : status === 'later' ? `(${card.stage})` : status === 'early' ? ' ok* ' : 'FAIL ';
    rows.push(`${tag} ${card.system}/${card.id}  ${key.padEnd(34)} ${fmt(v).padStart(9)}  [${range}] ${t.unit ?? ''}  ${t.label ?? ''}`);
  }
  result.specs[`${card.system}/${card.id}${card.key ? ':' + card.key : ''}`] = spec;
  result.passed += spec.passed;
  result.total += spec.total;
  result.missing += spec.missing;
}
console.log(rows.join('\n'));
console.log(`\n${result.passed}/${result.total} metrics in range` + (result.missing ? `, ${result.missing} not measured yet` : ''));

const boardFile = path.join(ROOT, 'loop/scoreboard.json');
const board = fs.existsSync(boardFile) ? JSON.parse(fs.readFileSync(boardFile, 'utf8')) : { history: [] };
board.current = result;
if (note !== null) {
  let commit = '';
  try { commit = execSync('git rev-parse --short HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch {}
  const per = {};
  for (const [k, s] of Object.entries(result.specs)) per[k] = `${s.passed}/${s.total}`;
  board.history.push({ iter: board.history.length + 1, time: new Date().toISOString(), commit, note, passed: result.passed, total: result.total, per });
}
fs.writeFileSync(boardFile, JSON.stringify(board, null, 2) + '\n');
if (strict && result.passed < result.total - result.missing) process.exit(1);
