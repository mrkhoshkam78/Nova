/**
 * knowledge.js – Nova V4.0.7 Local Knowledge Layer (offline, algorithm level ~12/20)
 *
 * Pipeline: normalize → signals → score → map → continuity
 * Uses NOVA_FA_DB.json only as a local dataset (never dumps full DB into prompts).
 */
const Knowledge = window.Knowledge = (() => {
  const DATASET_URL = "data/NOVA_FA_DB.json";
  const VERSION = "4.0.7";

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

  /** Layer: action / verb priors */
  const ACTION_PRIORS = [
    { re: /درست\s*کن|رفع\s*کن|فیکس|برطرف\s*کن|اصلاح\s*کن|fix\s*it|\bfix\b|solve|repair/i, fine: "fix", w: 0.38 },
    { re: /دیباگ|باگ\s*پیدا|علت\s*(چیست|چییه)|چرا\s*کار\s*نمی|root\s*cause|\bdebug\b/i, fine: "debug", w: 0.36 },
    { re: /stack\s*trace|این\s*خطا\s*یعنی|معنی\s*error|explain\s*error|چرا\s*این\s*exception/i, fine: "explain_error", w: 0.34 },
    { re: /منطق\s*کد|چطور\s*کار\s*می|چه\s*کار\s*می\s*کنه|explain\s*code|how\s*does\s*(this|it)/i, fine: "explain_code", w: 0.32 },
    { re: /رفاکتور|بازنویسی|تمیز\s*کن|خواناتر|refactor|clean\s*up/i, fine: "refactor", w: 0.36 },
    { re: /امنیت|xss|csrf|sql\s*inject|injection|\bsecurity\b/i, fine: "security", w: 0.4 },
    { re: /performance|بهینه|کند\s*شده|latency|memory\s*leak|\bcpu\b/i, fine: "performance", w: 0.34 },
    { re: /unit\s*test|تست\s*بنویس|test\s*case|coverage|\btest\b/i, fine: "test", w: 0.34 },
    { re: /pull\s*request|merge\s*conflict|\bcommit\b|\bbranch\b|\bgit\b/i, fine: "git", w: 0.32 },
    { re: /\bendpoint\b|\bfetch\b|cors|timeout|\bapi\b/i, fine: "api", w: 0.3 },
    { re: /\bquery\b|دیتابیس|migration|\bdatabase\b|\bsql\b/i, fine: "database", w: 0.32 },
    { re: /\bcss\b|\bdom\b|responsive|layout|کامپوننت|\bui\b/i, fine: "ui", w: 0.3 },
    { re: /معماری|architecture|coupling|ماژول‌بندی|ماژول بندی/i, fine: "architecture", w: 0.32 },
    { re: /بازبینی|code\s*review|ریویو|review\s*کن/i, fine: "review", w: 0.3 },
    { re: /توضیح|چیست|چیه|یعنی\s*چه|\bexplain\b|what\s+is/i, fine: "explain", w: 0.22 },
  ];

  const ANAPHORA_RE = /این\s*کد|همین\s*کد|کدش|کدشو|این\s*خطا|خطاش|همین\s*رو|اینو|کد\s*قبلی|this\s+code|the\s+error|previous/i;
  const SHORT_FOLLOW_RE = /^(بیشتر|ادامه|ادامه\s*بده|بیشتر\s*بگو|مثال|مثال\s*بزن|کدش|کدشو|درستش\s*کن|درست\s*کن|رفعش\s*کن|توضیح\s*بده|بده|کن|more|continue|fix\s*it)[\s!.،]*$/i;

  let _ready = false;
  let _loading = null;
  let terminology = {};
  let aliases = {};
  let intentIndex = [];
  let termTokens = new Map();

  // ── Layer 1: normalize ───────────────────────────────────────────────
  function normalize(text) {
    if (!text) return "";
    return String(text)
      .replace(/\u064A/g, "\u06CC")
      .replace(/\u0643/g, "\u06A9")
      .replace(/\u200c/g, " ")
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

  function coverage(querySet, docSet) {
    if (!querySet.size) return 0;
    let hit = 0;
    for (const x of querySet) if (docSet.has(x)) hit++;
    return hit / querySet.size;
  }

  // ── Load dataset ─────────────────────────────────────────────────────
  async function load() {
    if (_ready) return true;
    if (_loading) return _loading;
    _loading = (async () => {
      try {
        const res = await fetch(DATASET_URL + "?v=" + VERSION);
        if (!res.ok) throw new Error("dataset HTTP " + res.status);
        const data = await res.json();
        terminology = data.terminology || {};
        aliases = data.aliases || {};
        termTokens.clear();
        for (const [fa, meta] of Object.entries(terminology)) {
          const payload = { fa, en: (meta && meta.en) || "", description: (meta && meta.description) || "" };
          termTokens.set(normalize(fa), payload);
          if (meta && meta.en) termTokens.set(normalize(meta.en), payload);
        }
        for (const [alias, canonical] of Object.entries(aliases)) {
          const c = terminology[canonical];
          const payload = c
            ? { fa: canonical, en: c.en || "", description: c.description || "" }
            : { fa: canonical, en: "", description: "" };
          termTokens.set(normalize(alias), payload);
        }
        intentIndex = (data.intents || []).map((item) => ({
          label: item.label,
          tokens: tokenize(item.text),
          text: item.text,
        }));
        _ready = true;
        return true;
      } catch (err) {
        console.warn("[Knowledge] load failed (degrade to priors):", err && err.message);
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

  // ── Layer 2: signals – terminology ───────────────────────────────────
  function extractTerms(text) {
    const n = normalize(text);
    if (!n) return [];
    const hits = [];
    const seen = new Set();
    if (!_ready) return hits;
    const keys = [...termTokens.keys()].sort((a, b) => b.length - a.length);
    for (const key of keys) {
      if (key.length < 2) continue;
      if (n.includes(key)) {
        const meta = termTokens.get(key);
        if (meta && !seen.has(meta.fa)) {
          seen.add(meta.fa);
          hits.push(meta);
        }
      }
    }
    return hits;
  }

  function termBoosts(terms) {
    const bumps = {};
    const add = (lab, w) => {
      bumps[lab] = (bumps[lab] || 0) + w;
    };
    for (const t of terms) {
      const blob = ((t.en || "") + " " + (t.fa || "")).toLowerCase();
      if (/bug|error|debug|exception|traceback|باگ|خطا|دیباگ|استثنا/.test(blob)) {
        add("debug", 0.11);
        add("fix", 0.07);
        add("explain_error", 0.05);
      }
      if (/refactor|رفاکتور|بازنویسی|clean/.test(blob)) add("refactor", 0.13);
      if (/review|بازبینی|ریویو/.test(blob)) add("review", 0.1);
      if (/security|امنیت|xss|csrf|injection/.test(blob)) add("security", 0.16);
      if (/performance|بهینه|latency|memory/.test(blob)) add("performance", 0.13);
      if (/test|تست|assertion|coverage/.test(blob)) add("test", 0.12);
      if (/api|endpoint|fetch|http/.test(blob)) add("api", 0.11);
      if (/database|query|دیتابیس|sql/.test(blob)) add("database", 0.11);
      if (/ui|css|dom|responsive|کامپوننت/.test(blob)) add("ui", 0.1);
    }
    return bumps;
  }

  // ── Layer 3–5: score → map → continuity ──────────────────────────────
  /**
   * @param {string} text
   * @param {{prevFine?: string|null, hasCode?: boolean, hasError?: boolean}} opts
   */
  function matchIntent(text, opts) {
    opts = opts || {};
    const prevFine = opts.prevFine || null;
    const hasCode = !!opts.hasCode;
    const hasError = !!opts.hasError;
    const reasons = [];
    const terms = extractTerms(text);
    const q = tokenize(text);
    const n = normalize(text);
    const raw = text || "";

    const labelScores = {};
    const bump = (lab, w, why) => {
      if (!lab) return;
      labelScores[lab] = (labelScores[lab] || 0) + w;
      if (why) reasons.push(why);
    };

    // Signal: dataset example similarity (coverage-heavy for short FA queries)
    if (_ready && intentIndex.length && q.size) {
      const acc = {};
      const hits = {};
      for (const item of intentIndex) {
        const jac = jaccard(q, item.tokens);
        const cov = coverage(q, item.tokens);
        const sim = jac * 0.4 + cov * 0.6;
        if (sim < 0.1) continue;
        acc[item.label] = (acc[item.label] || 0) + sim;
        hits[item.label] = (hits[item.label] || 0) + 1;
      }
      for (const lab of Object.keys(acc)) {
        const avg = acc[lab] / Math.max(1, hits[lab]);
        const support = Math.min(1, hits[lab] / 6);
        bump(lab, avg * 0.62 + support * 0.28, null);
      }
      if (Object.keys(acc).length) reasons.push("dataset-overlap");
    }

    // Signal: action priors
    for (const p of ACTION_PRIORS) {
      if (p.re.test(raw) || p.re.test(n)) {
        bump(p.fine, p.w, "prior:" + p.fine);
      }
    }

    // Signal: terminology
    const tb = termBoosts(terms);
    for (const [lab, w] of Object.entries(tb)) {
      bump(lab, w, null);
    }
    if (terms.length) reasons.push("terms:" + terms.length);

    // Signal: anaphora + code/error context
    if (ANAPHORA_RE.test(raw) || ANAPHORA_RE.test(n)) {
      if (hasError || /خطا|error|exception|باگ/i.test(raw)) {
        bump("debug", 0.18, "anaphora+error");
        bump("fix", 0.1, null);
      } else if (hasCode || /کد|code|بررسی|درست/i.test(raw)) {
        if (/درست|رفع|فیکس|fix/i.test(raw)) bump("fix", 0.2, "anaphora+fix");
        else bump("review", 0.16, "anaphora+code");
      }
    }

    // Signal: short follow-up continuity
    if (prevFine && SHORT_FOLLOW_RE.test(n)) {
      bump(prevFine, 0.32, "continuity:" + prevFine);
    } else if (prevFine && /ادامه|بیشتر|همین|more|continue/i.test(n) && n.length < 48) {
      bump(prevFine, 0.18, "soft-continuity");
    }

    // Code presence slight review bias if no strong debug
    if (hasCode && !labelScores.debug && !labelScores.fix) {
      bump("review", 0.08, "has-code");
    }

    const ranked = Object.keys(labelScores)
      .map((lab) => ({ label: lab, score: labelScores[lab] }))
      .sort((a, b) => b.score - a.score);

    // Degrade path without dataset
    if (!ranked.length) {
      for (const p of ACTION_PRIORS) {
        if (p.re.test(raw)) {
          return {
            fine: p.fine,
            coarse: FINE_TO_COARSE[p.fine] || "general",
            confidence: 0.52,
            scores: { [p.fine]: Math.round(p.w * 100) / 100 },
            terms,
            reason: "prior-only-fallback",
            source: "fallback",
            version: VERSION,
          };
        }
      }
      return {
        fine: null,
        coarse: null,
        confidence: 0,
        scores: {},
        terms,
        reason: "no-signal",
        source: _ready ? "dataset" : "unloaded",
        version: VERSION,
      };
    }

    const top = ranked[0];
    if (top.score < 0.14) {
      return {
        fine: null,
        coarse: null,
        confidence: 0,
        scores: Object.fromEntries(ranked.slice(0, 4).map((r) => [r.label, Math.round(r.score * 100) / 100])),
        terms,
        reason: reasons.slice(0, 4).join("+") || "low-score",
        source: _ready ? "dataset" : "fallback",
        version: VERSION,
      };
    }

    const fine = top.label;
    const coarse = FINE_TO_COARSE[fine] || "general";
    const confidence = Math.min(0.96, 0.4 + top.score * 0.48);

    return {
      fine,
      coarse,
      confidence: Math.round(confidence * 100) / 100,
      scores: Object.fromEntries(ranked.slice(0, 5).map((r) => [r.label, Math.round(r.score * 100) / 100])),
      terms,
      reason: reasons.filter(Boolean).slice(0, 5).join(" | ") || "scored",
      source: _ready ? "dataset" : "fallback",
      version: VERSION,
    };
  }

  function mapFineToCoarse(fine) {
    return FINE_TO_COARSE[fine] || null;
  }

  function describeTerms(terms, max) {
    max = max || 4;
    if (!terms || !terms.length) return "";
    return terms
      .slice(0, max)
      .map((t) => `**${t.fa}** (${t.en})${t.description ? ": " + t.description : ""}`)
      .join("\n");
  }

  function buildHint(text, opts) {
    const m = matchIntent(text, opts);
    const parts = [];
    if (m.fine) parts.push(`موضوع تخصصی: ${m.fine} → ${m.coarse || "?"}`);
    if (m.terms && m.terms.length) {
      parts.push("اصطلاحات: " + m.terms.slice(0, 5).map((t) => t.fa + "/" + t.en).join("، "));
    }
    if (m.reason) parts.push("signals: " + m.reason);
    return { match: m, hint: parts.join(" | ") };
  }

  if (typeof window !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => load());
    } else {
      load();
    }
  }

  return {
    VERSION,
    load,
    isReady,
    normalize,
    extractTerms,
    matchIntent,
    mapFineToCoarse,
    describeTerms,
    buildHint,
    FINE_TO_COARSE,
  };
})();
