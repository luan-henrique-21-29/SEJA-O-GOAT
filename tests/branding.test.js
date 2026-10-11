import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

test('identity 2.1 includes local transparent svg variants', () => {
  for (const file of ['assets/brand-mark.svg','assets/brand-wordmark.svg','assets/favicon.svg']) {
    const svg = read(file);
    assert.match(svg, /<svg\b/);
    assert.match(svg, /<\/svg>/);
    assert.doesNotMatch(svg, /<image\b|<script\b|<foreignObject\b/i);
  }
});

test('visual introduction keeps real career navigation and saved game features', () => {
  const app = read('src/app.js');
  assert.match(app, /function introHTML\(\)/);
  assert.match(app, /data-action="nav" data-page="match"/);
  assert.match(app, /data-action="start-match"/);
  assert.match(app, /function save\(\)/);
  assert.match(app, /function initMatchRenderer\(\)/);
  assert.match(read('index.html'), /id="boot-screen"/);
});
