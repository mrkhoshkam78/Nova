/**
 * knowledge.js – Local Knowledge / Dataset Layer for Nova (offline)
 * Loads Persian programming terminology + labeled intents.
 * Does NOT inject into LLM system prompt. Used for:
 *  - intent scoring boost
 *  - terminology / alias resolution
 *  - fine-label → coarse-intent mapping before Debug/Analysis engines
 */
const Knowledge = window.Knowledge = (() => {
  const DATASET_URL = "data/nova_programming_dataset_v2.json";

  /** Fine labels from dataset → coarse intents used by chat/debugger */
  const FINE_TO_COARSE = {
    debug: "debug",
    fix: "debug",
    explain_error: "debug",
    review: "code-review",
    security: "code-review",
    performance: "code-review",
    architecture: "code-review",
    api: "code-review",
    database: "code-review",
    ui: "code-review",
    git: "code-review",
    config: "code-review",
    network: "code-review",
    test: "code-review",
    explain: "explain",
    explain_code: "explain",
    refactor: "refactor",
  };

  let _ready = false;
  let _loading = null;
  let terminology = {}; // fa → {en, description}
  let aliases = {}; // alias → canonical fa
  let intentIndex = []; // {label, tokens:Set, text}
  let termTokens = new Map(); // normalized term → meta

  function normalize(text) {
    if (!text) return "";
    return String(text)
      .replace(/\u064A/g, "\u06CC") // ي → ی
      .replace(/\u0643/g, "\u06A9") // ك → ک
      .replace(/\u200c/g, " ") // ZWNJ → space
      .replace(/[ي]/g, "ی")
      .replace(/[ك]/g, "ک")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function tokenize(text) {
    const n = normalize(text);
    const parts = n.match(/[\u0600-\u06FFa-z0-9_]+/gi) || [];
    return new Set(parts.filter((p) => p.length >= 2));
  }

  function jaccard(a, b) {
    if (!a.size && !b.size) return 0;
    let inter = 0;
    for (const x of a) if (b.has(x)) inter++;
    const union = a.size + b.size - inter;
    return union ? inter / union : 0;
  }

  async function load() {
    if (_ready) return true;
    if (_loading) return _loading;
    _loading = (async () => {
      try {
        const res = await fetch(DATASET_URL + "?v=2");
        if (!res.ok) throw new Error("dataset HTTP " + res.status);
        const data = await res.json();
        terminology = data.terminology || {};
        aliases = data.aliases || {};
        // Build term lookup (normalized)
        termTokens.clear();
        for (const [fa, meta] of Object.entries(terminology)) {
          const key = normalize(fa);
          termTokens.set(key, { fa, en: meta.en, description: meta.description || "" });
          if (meta.en) termTokens.set(normalize(meta.en), { fa, en: meta.en, description: meta.description || "" });
        }
        for (const [alias, canonical] of Object.entries(aliases)) {
          const c = terminology[canonical] || terminology[normalize(canonical)];
          const meta = c
            ? { fa: canonical, en: c.en, description: c.description || "" }
            : { fa: canonical, en: canonical, description: "" };
          termTokens.set(normalize(alias), meta);
        }
        // Index intents (token sets) – keep it light: store tokens only
        intentIndex = (data.intents || []).map((item) => ({
          label: item.label,
          tokens: tokenize(item.text),
          text: item.text,
        }));
        _ready = true;
        return true;
      } catch (err) {
        console.warn("[Knowledge] dataset load failed – running without boost:", err && err.message);
        _ready = false;
        return false;
      } finally {
        _loading = null;
      }
    })();
    return _loading;
  }

  function isReady() {
    return _ready;
  }

  /** Resolve aliases / terminology hits in user text */
  function extractTerms(text) {
    if (!_ready) return [];
    const n = normalize(text);
    const hits = [];
    const seen = new Set();
    for (const [key, meta] of termTokens.entries()) {
      if (key.length < 2) continue;
      if (n.includes(key) && !seen.has(meta.fa)) {
        seen.add(meta.fa);
        hits.push(meta);
      }
    }
    return hits;
  }

  /**
   * Score user text against labeled examples → fine label + confidence
   * Pure offline, no network after load.
   */
  function matchIntent(text, topK = 3) {
    if (!_ready || !intentIndex.length) {
      return { fine: null, coarse: null, confidence: 0, scores: {}, terms: [] };
    }
    const q = tokenize(text);
    if (q.size === 0) {
      return { fine: null, coarse: null, confidence: 0, scores: {}, terms: extractTerms(text) };
    }

    const labelScores = {};
    const labelHits = {};

    for (const item of intentIndex) {
      const sim = jaccard(q, item.tokens);
      if (sim < 0.12) continue;
      const lab = item.label;
      labelScores[lab] = (labelScores[lab] || 0) + sim;
      labelHits[lab] = (labelHits[lab] || 0) + 1;
    }

    // Average by hits, prefer labels with more supporting examples
    const ranked = Object.keys(labelScores).map((lab) => {
      const avg = labelScores[lab] / Math.max(1, labelHits[lab]);
      const support = Math.min(1, labelHits[lab] / 8);
      const score = avg * 0.7 + support * 0.3;
      return { label: lab, score };
    });
    ranked.sort((a, b) => b.score - a.score);

    const best = ranked[0] || null;
    const terms = extractTerms(text);
    // Terminology boost: if strong debug/fix terms appear, nudge
    const termBoost = {};
    for (const t of terms) {
      const en = (t.en || "").toLowerCase();
      const fa = t.fa || "";
      if (/bug|error|debug|exception|traceback|باگ|خطا|دیباگ|استثنا/.test(en + fa)) {
        termBoost.debug = (termBoost.debug || 0) + 0.08;
        termBoost.fix = (termBoost.fix || 0) + 0.05;
      }
      if (/refactor|رفاکتور|بازنویسی|clean/.test(en + fa)) termBoost.refactor = (termBoost.refactor || 0) + 0.1;
      if (/review|بازبینی|ریویو/.test(en + fa)) termBoost.review = (termBoost.review || 0) + 0.08;
      if (/security|امنیت|xss|injection|csrf/.test(en + fa)) termBoost.security = (termBoost.security || 0) + 0.12;
      if (/performance|بهینه|latency|memory/.test(en + fa)) termBoost.performance = (termBoost.performance || 0) + 0.1;
    }
    for (const [lab, b] of Object.entries(termBoost)) {
      const row = ranked.find((r) => r.label === lab);
      if (row) row.score += b;
      else ranked.push({ label: lab, score: b });
    }
    ranked.sort((a, b) => b.score - a.score);

    const top = ranked[0];
    if (!top || top.score < 0.15) {
      return {
        fine: null,
        coarse: null,
        confidence: 0,
        scores: Object.fromEntries(ranked.slice(0, topK).map((r) => [r.label, Math.round(r.score * 100) / 100])),
        terms,
      };
    }

    const fine = top.label;
    const coarse = FINE_TO_COARSE[fine] || "general";
    const confidence = Math.min(0.95, 0.4 + top.score * 0.55);

    return {
      fine,
      coarse,
      confidence: Math.round(confidence * 100) / 100,
      scores: Object.fromEntries(ranked.slice(0, topK).map((r) => [r.label, Math.round(r.score * 100) / 100])),
      terms,
    };
  }

  function mapFineToCoarse(fine) {
    return FINE_TO_COARSE[fine] || null;
  }

  /** Short description for UI / mock enrichment */
  function describeTerms(terms, max = 4) {
    if (!terms || !terms.length) return "";
    return terms
      .slice(0, max)
      .map((t) => `**${t.fa}** (${t.en})${t.description ? ": " + t.description : ""}`)
      .join("\n");
  }

  // Kick off load early (non-blocking)
  if (typeof window !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => load());
    } else {
      load();
    }
  }

  return {
    load,
    isReady,
    normalize,
    extractTerms,
    matchIntent,
    mapFineToCoarse,
    describeTerms,
    FINE_TO_COARSE,
  };
})();
