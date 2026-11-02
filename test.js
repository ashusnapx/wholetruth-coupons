// Run with: node test.js
const assert = require('node:assert');
const WTF = require('./lib.js');

const merged = WTF.merge(
  [{ code: 'SAVE10', note: 'from site' }],
  [{ code: ' save10 ', note: 'dup from community' }, { code: 'NEW20' }, { code: '' }, null],
  undefined,
);
assert.deepStrictEqual(merged.map((c) => c.code), ['SAVE10', 'NEW20']);
assert.strictEqual(merged[0].note, 'from site');

assert.strictEqual(WTF.best([]), null);
assert.strictEqual(WTF.best([{ code: 'A', ok: false, discount: 500 }, { code: 'B', ok: true, discount: 0 }]), null);
assert.strictEqual(
  WTF.best([
    { code: 'A', ok: true, discount: 120 },
    { code: 'B', ok: false, discount: 900 },
    { code: 'C', ok: true, discount: 340 },
  ]).code,
  'C',
);

assert.strictEqual(WTF.readJSON('{"token":"x"}').token, 'x');
assert.strictEqual(WTF.readJSON('not json'), null);
assert.strictEqual(WTF.readJSON(null), null);

console.log('ok');
