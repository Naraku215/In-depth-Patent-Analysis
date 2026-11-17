import assert from 'node:assert/strict';
import { parseCorpus, deLatex } from '../lib/corpus.mjs';
import { extractNumbers } from '../lib/numbers.mjs';

const md = `# Test patent

![](images/a.jpg)
FIG. 1

A plasma torch 21 is positioned at the reactor chamber 20. A coolant inlet 24 and a coolant outlet 25 are connected to the jacket.

![](images/b.jpg)
FIG. 2

The nozzle 22 has a throat 11 and a diverging section 12.
`;

const c = parseCorpus(md);
assert.equal(c.figures.length, 2);
assert.deepEqual(c.figures.map((f) => f.n), ['1', '2']);
assert.deepEqual(c.figures.map((f) => f.side), ['after', 'after']);
assert.ok(c.referenceSigns.some((s) => s.num === '21' && /plasma torch/i.test(s.label)));
assert.ok(c.referenceSigns.some((s) => s.num === '20' && /reactor chamber/i.test(s.label)));
assert.ok(c.referenceSigns.some((s) => s.num === '20' && /reactor chamber/i.test(s.label)));

assert.equal(deLatex('at $1,500^{\\circ}\\mathrm{C}$ and $9000\\mathrm{K}$'), 'at 1,500°C and 9000K');

const nums = extractNumbers('9000K, 1500 C, 10–15 mL/h, 1,500–2,800°C');
assert.ok(nums.some((n) => n.raw === '9000K' && n.unit === 'K'));
assert.ok(nums.some((n) => n.raw === '1500 C' && n.unit === '°C'));
assert.ok(nums.some((n) => Array.isArray(n.value) && n.unit === 'mL/h'));
assert.ok(nums.some((n) => Array.isArray(n.value) && n.unit === '°C'));

assert.equal(deLatex('about $1500^{\\circ}$ C'), 'about 1500°C');
assert.equal(extractNumbers('chamber 20 may be')[0].unit, '');
assert.ok(extractNumbers('chamber 20 may be').every((n) => n.raw !== '20 m'));

console.log('formats: ok');

