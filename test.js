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

assert.deepStrictEqual(WTF.terms(null), []);
assert.deepStrictEqual(
  WTF.terms({
    type: 'PERCENTAGE',
    get_percent: 15,
    min_order_value: 999,
    applies_on: 'MRP',
    product_categories: [{ name: 'Protein Bars' }],
    applicable_payment_mode: 'ONLINE',
    only_for_new_customer: true,
    usage_limit_per_customer_type: 'ONLY_ONCE',
  }),
  ['15% off', 'Min order ₹999 (on MRP)', 'Only on Protein Bars', 'Prepaid orders only', 'New customers only', 'Once per customer'],
);
assert.deepStrictEqual(WTF.terms({ type: 'GRANULAR', applicable_payment_mode: 'ALL' }), ['Only on specific products']);
assert.deepStrictEqual(WTF.terms({ type: 'FIXED', get_flat_discount: 100, product_variants: [{ product: { title: 'A' } }, { title: 'B' }, { title: 'C' }, { title: 'D' }] }), [
  'Flat ₹100 off',
  'Only on A, B, C +1 more',
]);
assert.match(WTF.terms({ ends_at: '2026-12-15T12:00:00Z' })[0], /^Valid till 15 Dec 2026$/);

assert.strictEqual(WTF.shortfall(999, 804.5), 195);
assert.strictEqual(WTF.shortfall(999, 1200), 0);
assert.strictEqual(WTF.shortfall(0, 100), 0);
assert.strictEqual(WTF.shortfall(500, undefined), 500);

const { extract, merge, format } = require('./scripts/update-codes.js');

const page = `
  <div data-code="CLEANEST"></div><a data-code='peanuts'></a><div data-code="Deals Unlocked"></div><b data-code="12345"></b>
  <span class='offer-code'>BARLOVE</span><span id="code-19804" hidden>DHAMAKA8</span>
  <div>Use coupon code &#8220;NAIMASTRUTH&#8221; to avail this offer.</div>
  <tr><td>BARLOVE</td><td>15% OFF</td><td>Get 15% OFF On Orders Above Rs.1,500</td></tr>`;
const found = extract(page);
assert.deepStrictEqual([...found.keys()].sort(), ['BARLOVE', 'CLEANEST', 'DHAMAKA8', 'NAIMASTRUTH', 'PEANUTS']);
assert.deepStrictEqual(found.get('BARLOVE'), { terms: ['15% OFF (reported)', 'Get 15% OFF On Orders Above Rs.1,500'], min: 1500 });

const daily = merge(
  [
    { code: 'MANUAL', note: 'hand-added' },
    { code: 'STALE', auto: true, seen: '2026-09-01' },
    { code: 'RECENT', auto: true, seen: '2026-10-20' },
    { code: 'AGAIN', auto: true, seen: '2026-01-01' },
  ],
  new Map([
    ['MANUAL', { sites: ['a.com'], terms: [], min: 0 }],
    ['AGAIN', { sites: ['a.com', 'b.com'], terms: ['10% off'], min: 999 }],
    ['NEW', { sites: ['b.com'], terms: [], min: 0 }],
  ]),
  '2026-11-02',
);
assert.deepStrictEqual(daily, [
  { code: 'MANUAL', note: 'hand-added' },
  { code: 'AGAIN', note: 'Listed on a.com, b.com', terms: ['10% off'], min: 999, auto: true, seen: '2026-11-02' },
  { code: 'NEW', note: 'Listed on b.com', auto: true, seen: '2026-11-02' },
  { code: 'RECENT', auto: true, seen: '2026-10-20' },
]);
assert.deepStrictEqual(JSON.parse(format(daily)), daily);

assert.strictEqual(WTF.readJSON('{"token":"x"}').token, 'x');
assert.strictEqual(WTF.readJSON('not json'), null);
assert.strictEqual(WTF.readJSON(null), null);

console.log('ok');
