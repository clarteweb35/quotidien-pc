import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { refFromSlot, listManualImages, renderManualImageList } from '../src/refs.js';
import { makeCtx, cleanup } from './helpers.js';
import { runCycle } from '../src/pipeline.js';
import { parseArticleFile } from '../src/publisher.js';

test('reference d\'article derivee du creneau', () => {
  assert.equal(refFromSlot('2026-10-24#7'), '261024-08');
  assert.equal(refFromSlot('2026-10-24#0'), '261024-01');
  assert.equal(refFromSlot('2026-10-24#x1'), '261024-X1');
  assert.equal(refFromSlot('2026-01-05#x-rel-ab12cd34'), '260105-XRELAB');
  assert.equal(refFromSlot('n importe quoi'), null);
  assert.equal(refFromSlot(undefined), null);
});

test('chaque article publie porte une reference unique et une consigne d\'image', async () => {
  const ctx = makeCtx({ mutateCfg: (c) => { c.schedule.maxPublicationsPerRun = 5; c.schedule.catchupMinutes = 400; } });
  await runCycle(ctx);
  const fms = ctx.articles().map((f) => parseArticleFile(fs.readFileSync(path.join(ctx.paths.content, f), 'utf8')).fm);
  assert.ok(fms.length >= 3);
  assert.ok(fms.every((fm) => /^\d{6}-(\d{2}|X\d+)$/.test(fm.ref)));
  assert.equal(new Set(fms.map((fm) => fm.ref)).size, fms.length);
  assert.ok(fms.every((fm) => fm.imagePrompt && fm.imageAlt));
  cleanup(ctx);
});

test('liste des images manuelles: detection insensible a la casse et aux extensions', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lgn-man-'));
  for (const f of ['261024-x1.JPG', '261024-02.png', 'notes.txt', '.gitkeep']) fs.writeFileSync(path.join(dir, f), 'x');
  const m = listManualImages(dir);
  assert.deepEqual(Object.keys(m).sort(), ['261024-02', '261024-X1']);
  const cfg = makeCtx().cfg;
  const md = renderManualImageList({
    articles: [
      { slot: '2026-10-24#x1', title: 'Avec image', category: 'societe', publishedAt: '2026-10-24T10:00:00Z' },
      { slot: '2026-10-24#x2', title: 'Sans image', category: 'tech', publishedAt: '2026-10-24T11:00:00Z', imagePrompt: 'Une pile de dossiers' },
    ],
    manual: m,
    cfg,
  });
  assert.ok(md.includes('Sans image (1)') && md.includes('`261024-X2` — Sans image') && md.includes('Une pile de dossiers'));
  assert.ok(md.includes('Déjà illustrés (1)') && md.includes('261024-x1.JPG'));
  fs.rmSync(dir, { recursive: true, force: true });
});
