// Pure helpers: loaded before content.js on the page, and required by test.js under Node.
const WTF = {
  // One entry per code across all sources; earlier lists win, so the site's own notes beat community ones.
  merge(...lists) {
    const seen = new Map();
    for (const list of lists) {
      for (const c of list || []) {
        const code = String(c?.code || '').trim();
        if (code && !seen.has(code.toUpperCase())) seen.set(code.toUpperCase(), { ...c, code });
      }
    }
    return [...seen.values()];
  },

  best(results) {
    return results.filter((r) => r.ok && r.discount > 0).sort((a, b) => b.discount - a.discount)[0] || null;
  },

  // Short conditions from a site price rule, worded like the site's own coupon cards.
  terms(r) {
    if (!r) return [];
    const n = (v) => typeof v === 'number' && v > 0;
    const inr = (v) => `₹${v.toLocaleString('en-IN')}`;
    const names = [...(r.product_categories || []), ...(r.product_variants || [])]
      .map((p) => p?.name || p?.product?.title || p?.title)
      .filter(Boolean);
    const specific = r.type === 'GRANULAR' || r.product_categories?.length || r.product_variants?.length;
    return [
      r.type === 'FIXED' && n(r.get_flat_discount) && `Flat ${inr(r.get_flat_discount)} off`,
      r.type === 'PERCENTAGE' && n(r.get_percent) && `${r.get_percent}% off`,
      r.type === 'BXGY' && n(r.buy_x) && n(r.get_y) && `Buy ${r.buy_x}, get ${r.get_y} free`,
      r.type === 'BXAY' && n(r.buy_x) && n(r.at_y) && `Buy ${r.buy_x}, pay for ${r.at_y}`,
      n(r.min_order_value) && `Min order ${inr(r.min_order_value)}${r.applies_on === 'MRP' ? ' (on MRP)' : ''}`,
      n(r.min_order_qty) && `Min ${r.min_order_qty} items`,
      names.length
        ? `Only on ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` +${names.length - 3} more` : ''}`
        : specific && 'Only on specific products',
      r.applicable_payment_mode === 'ONLINE' && 'Prepaid orders only',
      r.applicable_payment_mode === 'COD' && 'Cash on delivery only',
      r.only_for_new_customer && 'New customers only',
      r.usage_limit_per_customer_type === 'ONLY_ONCE' && 'Once per customer',
      r.ends_at && `Valid till ${new Date(r.ends_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`,
    ].filter(Boolean);
  },

  // How much more the cart needs before a minimum-order code can work.
  shortfall(min, total) {
    return min > 0 ? Math.max(0, Math.ceil(min - (total || 0))) : 0;
  },

  readJSON(raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
};

if (typeof module !== 'undefined') module.exports = WTF;
