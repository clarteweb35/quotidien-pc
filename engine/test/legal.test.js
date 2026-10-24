import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../src/config.js';

const legal = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/legal.json'), 'utf8'));

test('mentions legales: contact, hebergeur et editeur renseignes', () => {
  assert.match(legal.contactEmail, /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i);
  assert.equal(legal.publisherName, 'Clarté Web');
  assert.match(legal.host.name, /GitHub/);
  assert.ok(legal.host.address.length > 20);
});

test('identifiant Google Analytics: vide ou au format GA4 (G-XXXXXXXX)', () => {
  assert.ok(legal.analytics.measurementId === '' || /^G-[A-Z0-9]{6,12}$/.test(legal.analytics.measurementId));
  if (legal.publisherUrl) assert.match(legal.publisherUrl, /^https:\/\//);
});
