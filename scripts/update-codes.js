// Daily job: collects The Whole Truth codes from public coupon pages and merges them into codes.json.
// Run with: node scripts/update-codes.js
const fs = require('node:fs');
const path = require('node:path');

const FILE = path.join(__dirname, '..', 'codes.json');
const UA = 'truth-coupons-bot (+https://github.com/ashusnapx/wholetruth-coupons)';
// Codes this job added are dropped once no source has listed them for this many days.
const KEEP_DAYS = 30;

// One page per site, fetched once a day. Sites that load codes with JavaScript (DealDrop, DesiDime)
// or block bots (Wethrift, Knoji, CouponBirds) are left out.
const SOURCES = [
  'https://www.grabon.in/thewholetruthfoods-coupons/',
  'https://www.coupona.in/the-whole-truth-foods-coupon-codes',
  'https://couponnxt.com/store/the-whole-truth-coupon-code/',
  'https://askmeoffers.com/thewholetruthfoods-coupons/',
  'https://couponzania.com/stores/thewholetruthfoods.com',
  'https://www.couponcodes.asia/store/the-whole-truth-foods-coupons/',
  'https://www.couponalexa.com/store/the-whole-truth-foods-coupon/',
  'https://www.couponterra.com/coupons/thewholetruthfoods.com',
  'https://www.greenpromocode.com/coupons/the-whole-truth-foods/',
];

// Markup the coupon sites use for a code; each regex captures the code.
const PATTERNS = [
  /data-code=["']([^"']+)["']/g, // grabon, askmeoffers, couponzania, couponcodes.asia, couponalexa, couponterra
  /class=["']offer-code["']>([^<]+)</g, // coupona
  /<span id="code-\d+" hidden>([^<]+)</g, // couponnxt
  /coupon code\s*(?:&#8220;|“|&quot;|")([^&”"<]+)/gi, // greenpromocode: Use coupon code “X”
];
// coupona's summary table: code, discount, description.
const TABLE = /<tr><td>([^<]+)<\/td><td>([^<]+)<\/td><td>([^<]+)<\/td><\/tr>/g;

// Returns Map(code -> { terms, min }) for one page.
function extract(html) {
  const found = new Map();
  const add = (raw, terms = []) => {
    const code = raw.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,20}$/.test(code) || !/[A-Z]/.test(code)) return;
    const prev = found.get(code) || { terms: [], min: 0 };
    const min = Number(terms.join(' ').match(/above\s*(?:rs\.?|₹|inr)?\s*([\d,]+)/i)?.[1].replace(/,/g, '')) || 0;
    found.set(code, { terms: [...new Set([...prev.terms, ...terms])], min: prev.min || min });
  };
  for (const re of PATTERNS) for (const m of html.matchAll(re)) add(m[1]);
  for (const [, code, off, desc] of html.matchAll(TABLE)) add(code, [`${off.trim()} (reported)`, desc.trim()]);
  return found;
}

// Hand-added entries (no `auto` flag) are never touched. Scraped codes are refreshed, added,
// or dropped after KEEP_DAYS without a sighting. `scraped` is Map(code -> { sites, terms, min }).
function merge(existing, scraped, today) {
  const manual = existing.filter((c) => !c.auto);
  const known = new Set(manual.map((c) => c.code.toUpperCase()));
  const auto = [];
  for (const [code, s] of scraped) {
    if (known.has(code)) continue;
    auto.push({
      code,
      note: `Listed on ${s.sites.join(', ')}`,
      ...(s.terms.length && { terms: s.terms }),
      ...(s.min && { min: s.min }),
      auto: true,
      seen: today,
    });
  }
  for (const c of existing) {
    const code = c.code.toUpperCase();
    if (c.auto && !scraped.has(code) && !known.has(code) && (Date.parse(today) - Date.parse(c.seen)) / 864e5 <= KEEP_DAYS) auto.push(c);
  }
  return [...manual, ...auto.sort((a, b) => a.code.localeCompare(b.code))];
}

// One entry per line, like the hand-edited file.
const format = (list) => `[\n${list.map((c) => `  ${JSON.stringify(c)}`).join(',\n')}\n]\n`;

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const scraped = new Map();
  for (const url of SOURCES) {
    const site = new URL(url).hostname.replace(/^www\./, '');
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw Error(`HTTP ${res.status}`);
      const found = extract(await res.text());
      console.log(`${site}: ${[...found.keys()].join(' ') || 'no codes'}`);
      for (const [code, f] of found) {
        const s = scraped.get(code) || { sites: [], terms: [], min: 0 };
        scraped.set(code, { sites: [...s.sites, site], terms: [...new Set([...s.terms, ...f.terms])], min: s.min || f.min });
      }
    } catch (e) {
      console.warn(`${site}: skipped (${e.message})`);
    }
  }
  const existing = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  fs.writeFileSync(FILE, format(merge(existing, scraped, today)));
}

if (require.main === module) main();

module.exports = { extract, merge, format };
