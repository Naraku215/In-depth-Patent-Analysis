import assert from 'node:assert/strict';
import { analyzeStationSemantics } from '../lib/semantics.mjs';

const ok = analyzeStationSemantics([
  { id: 'v1', label: '流程', labels: ['21 等离子炬', '20 反应腔'], parts: ['21', '20'], boxes: [], viewport: { x: 0, y: 0, w: 1000, h: 500 } }
]);
assert.equal(ok.ok, true);
assert.equal(ok.errors.length, 0);

const bad = analyzeStationSemantics([
  { id: 'v1', label: '流程', labels: ['21 等离子炬', '11 喉部'], parts: ['21', '20'], boxes: [], viewport: { x: 0, y: 0, w: 1000, h: 500 } }
]);
assert.equal(bad.ok, false);
assert.deepEqual(bad.errors[0].missingInLabels, ['20']);
assert.deepEqual(bad.errors[0].missingInTable, ['11']);

console.log('semantics: ok');
