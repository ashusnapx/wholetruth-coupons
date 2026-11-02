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

  readJSON(raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
};

if (typeof module !== 'undefined') module.exports = WTF;
