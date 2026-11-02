// Same endpoints the site's own cart drawer calls, sent from the page so the site's CORS rules apply.
const API = 'https://api.thewholetruthfoods.com/store';
// shortcut: public storefront key copied from the site's JS bundle; update it if the site rotates it.
const KEY = 'pk_8cd245a7362ae42363879dd525e69c4fde2cfcc72bb6eb1439e52624890e4421';
const COMMUNITY = 'https://raw.githubusercontent.com/ashusnapx/wholetruth-coupons/main/codes.json';

function headers() {
  const token = WTF.readJSON(localStorage.getItem('auth'))?.token;
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'x-publishable-api-key': KEY,
    ...(token && { Authorization: `Bearer ${token}` }),
  };
}

async function api(path, body) {
  const res = await fetch(API + path, { method: body ? 'POST' : 'GET', headers: headers(), body: body && JSON.stringify(body) });
  return res.json().catch(() => ({}));
}

function cartId() {
  return WTF.readJSON(localStorage.getItem('cart'))?.cart?.id || document.cookie.match(/_medusa_cart_id=([^;]+)/)?.[1];
}

async function loadCodes() {
  const items = WTF.readJSON(localStorage.getItem('cart'))?.cart?.items || [];
  const [site, offers, community, mine] = await Promise.all([
    api('/coupons/active')
      .then((j) => (j.data?.priceRules || []).map((r) => ({ code: r.discount_code, note: r.title || r.description || '', source: 'site' })))
      .catch(() => []),
    items.length
      ? api(`/discounts/offers-on-product?${items.map((i) => `variant_id=${encodeURIComponent(i.variant_id)}`).join('&')}`)
          .then((j) => Object.values(j.data?.offers || {}).flat().map((o) => ({ code: o.code, note: 'offer on an item in your cart', source: 'site' })))
          .catch(() => [])
      : [],
    fetch(COMMUNITY)
      .then((r) => r.json())
      .then((list) => list.map((c) => ({ ...c, source: 'community' })))
      .catch(() => []),
    chrome.storage.local.get('mine').then((s) => (s.mine || []).map((code) => ({ code, source: 'yours' }))),
  ]);
  return WTF.merge(site, offers, community, mine);
}

let lastCart;
async function discount(action, code, id) {
  const j = await api(`/discounts/${action}`, { code, cart_id: id });
  if (j.data?.cart) lastCart = j.data.cart;
  return j;
}

const remove = (code, id) => discount('remove', code, id);

async function apply(code, id) {
  const j = await discount('apply', code, id);
  const d = j.data?.discountResult;
  return { code, ok: !!d?.isApplied, discount: Number(d?.discount) || 0, message: d?.message || j.message || 'Not applicable' };
}

// The site rebuilds its cart drawer from this redux-persist copy on load, not from the server.
function saveCart() {
  const saved = WTF.readJSON(localStorage.getItem('cart'));
  if (saved?.cart && lastCart) localStorage.setItem('cart', JSON.stringify({ ...saved, cart: lastCart }));
}

// Each code is tested on a clean cart (the site refuses a code when a bigger one is already on), then the best one is put back.
async function tryAll(codes, onResult) {
  const id = cartId();
  const cart = id && (await api(`/carts/${id}`)).data?.cart;
  if (!cart?.items?.length) throw Error('Add something to your cart first, then try again.');
  const original = cart.metadata?.discount?.code;
  let current = original;
  const results = [];
  for (const c of WTF.merge(original ? [{ code: original, source: 'applied' }] : [], codes)) {
    if (current) await remove(current, id);
    const r = await apply(c.code, id);
    current = r.ok ? c.code : null;
    results.push(r);
    onResult(r, c);
  }
  const best = WTF.best(results);
  const keep = best?.code || original;
  if (keep && keep !== current) {
    if (current) await remove(current, id);
    await apply(keep, id);
  } else if (!keep && current) {
    await remove(current, id);
  }
  saveCart();
  return { best, tested: results.length };
}

// ---------- UI ----------

const host = document.createElement('div');
const root = host.attachShadow({ mode: 'open' });
root.innerHTML = `
<style>
  :host { all: initial; }
  * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  .fab { position: fixed; left: 16px; bottom: 16px; z-index: 2147483647; display: flex; align-items: center; gap: 8px;
    padding: 10px 16px; border: 0; border-radius: 999px; background: #14231b; color: #f4f1e8; font-size: 14px; font-weight: 600;
    box-shadow: 0 6px 24px rgba(0,0,0,.25); cursor: pointer; }
  .fab b { background: #ffd23f; color: #14231b; border-radius: 999px; padding: 2px 8px; font-size: 12px; }
  .panel { position: fixed; left: 16px; bottom: 68px; z-index: 2147483647; width: min(360px, calc(100vw - 32px));
    max-height: min(560px, calc(100vh - 100px)); display: flex; flex-direction: column; background: #fffdf7; color: #14231b;
    border-radius: 16px; box-shadow: 0 12px 40px rgba(0,0,0,.28); overflow: hidden; }
  .panel[hidden] { display: none; }
  header { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; background: #14231b; color: #f4f1e8; }
  header h2 { margin: 0; font-size: 15px; }
  header button { background: none; border: 0; color: inherit; font-size: 20px; cursor: pointer; line-height: 1; }
  .status { margin: 0; padding: 10px 16px; font-size: 13px; background: #f1ecdc; }
  .status.win { background: #d9f2df; font-weight: 600; }
  .status.err { background: #fde2e1; }
  ul { list-style: none; margin: 0; padding: 4px 0; overflow: auto; flex: 1; }
  li { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; padding: 8px 16px; border-bottom: 1px solid #eee6d3; font-size: 13px; }
  li code { font-family: ui-monospace, Menlo, monospace; font-weight: 700; letter-spacing: .02em; }
  li small { grid-column: 1; color: #5c6b62; font-size: 12px; }
  li .res { grid-row: 1 / span 2; grid-column: 2; align-self: center; font-size: 12px; text-align: right; max-width: 150px; }
  li.ok .res { color: #157a3a; font-weight: 700; }
  li.no .res { color: #9a3b33; }
  li.best { background: #fff4c2; }
  form { display: flex; gap: 8px; padding: 10px 16px 0; }
  input { flex: 1; padding: 8px 10px; border: 1px solid #d8d0bb; border-radius: 8px; font-size: 13px; text-transform: uppercase; }
  form button { padding: 8px 12px; border: 1px solid #14231b; border-radius: 8px; background: #fff; cursor: pointer; font-size: 13px; }
  .go { margin: 10px 16px 16px; padding: 12px; border: 0; border-radius: 10px; background: #ffd23f; color: #14231b;
    font-size: 14px; font-weight: 700; cursor: pointer; }
  .go:disabled { opacity: .6; cursor: progress; }
  button:focus-visible, input:focus-visible { outline: 2px solid #2f7d4f; outline-offset: 2px; }
</style>
<button class="fab" aria-expanded="false"><span>🏷️ Coupons</span><b>…</b></button>
<section class="panel" hidden aria-label="Coupon finder">
  <header><h2>Truth Coupons</h2><button class="x" aria-label="Close">×</button></header>
  <p class="status" role="status">Fetching coupons…</p>
  <ul></ul>
  <form><input placeholder="Add a code you found" aria-label="Coupon code"><button>Add</button></form>
  <button class="go">Try all &amp; apply the best</button>
</section>`;
document.body.append(host);

const $ = (s) => root.querySelector(s);
const fab = $('.fab');
const panel = $('.panel');
const msg = $('.status');
const list = $('ul');
const go = $('.go');
let codes = [];

const say = (text, kind = '') => {
  msg.textContent = text;
  msg.className = `status ${kind}`;
};

function row(c) {
  let li = [...list.children].find((el) => el.dataset.code === c.code.toUpperCase());
  if (!li) {
    li = document.createElement('li');
    li.dataset.code = c.code.toUpperCase();
    li.innerHTML = '<code></code><span class="res"></span><small></small>';
    li.querySelector('code').textContent = c.code;
    li.querySelector('small').textContent = [c.note, c.source].filter(Boolean).join(' · ');
    list.append(li);
  }
  return li;
}

async function refresh() {
  codes = await loadCodes();
  list.textContent = '';
  codes.forEach(row);
  $('.fab b').textContent = codes.length;
  say(codes.length ? `${codes.length} codes found. Tap below to test them on your cart.` : 'No codes found right now.');
}

fab.onclick = () => {
  panel.hidden = !panel.hidden;
  fab.setAttribute('aria-expanded', String(!panel.hidden));
};
$('.x').onclick = fab.onclick;

$('form').onsubmit = async (e) => {
  e.preventDefault();
  const code = $('input').value.trim().toUpperCase();
  if (!code) return;
  const { mine = [] } = await chrome.storage.local.get('mine');
  await chrome.storage.local.set({ mine: [...new Set([...mine, code])] });
  $('input').value = '';
  await refresh();
};

go.onclick = async () => {
  go.disabled = true;
  list.querySelectorAll('li').forEach((li) => {
    li.className = '';
    li.querySelector('.res').textContent = '';
  });
  try {
    let n = 0;
    const { best, tested } = await tryAll(codes, (r, c) => {
      const li = row(c);
      li.className = r.ok ? 'ok' : 'no';
      li.querySelector('.res').textContent = r.ok ? `✅ ₹${r.discount} off` : `❌ ${r.message}`;
      say(`Testing ${++n} of ${codes.length}…`);
    });
    if (best) {
      row(best).classList.add('best');
      say(`Applied ${best.code}: you save ₹${best.discount}. Tested ${tested} codes. Reloading cart…`, 'win');
      setTimeout(() => location.reload(), 2500);
    } else {
      say(`Tested ${tested} codes, none work on this cart right now.`, 'err');
    }
  } catch (e) {
    say(e.message, 'err');
  }
  go.disabled = false;
};

refresh().catch((e) => say(`Could not load coupons: ${e.message}`, 'err'));
