/**
 * knowledge.js – Local Knowledge Layer for Nova V4.0.1 (offline)
 * Persian programming terminology + labeled intents.
 * Used BEFORE Debug/Analysis engines — never dumped into system prompt.
 */
const Knowledge = window.Knowledge = (() => {
  const DATASET_URL = "data/NOVA_FA_DB.json";

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

  // High-signal action verbs → fine label prior
  const ACTION_PRIORS = [
    { re: /درست\s*کن|رفع\s*کن|فیکس|برطرف\s*کن|fix\s*it|solve|repair/i, fine: "fix", w: 0.35 },
    { re: /دیباگ|باگ\s*پیدا|علت\s*چیست|چرا\s*کار\s*نمی|debug|root\s*cause/i, fine: "debug", w: 0.32 },
    { re: /توضیح\s*بده|یعنی\s*چه|چه\s*معنی|explain\s*error|stack\s*trace/i, fine: "explain_error", w: 0.28 },
    { re: /چطور\s*کار\s*می|منطق\s*کد|چه\s*کار\s*می\s*کنه|explain\s*code|how\s*does/i, fine: "explain_code", w: 0.28 },
    { re: /رفاکتور|بازنویسی|تمیز\s*کن|refactor|clean\s*up/i, fine: "refactor", w: 0.32 },
    { re: /امنیت|xss|csrf|injection|sql\s*inject|security/i, fine: "security", w: 0.38 },
    { re: /performance|بهینه|کند|latency|memory\s*leak|cpu/i, fine: "performance", w: 0.32 },
    { re: /unit\s*test|تست\s*بنویس|test\s*case|coverage/i, fine: "test", w: 0.32 },
    { re: /pull\s*request|merge\s*conflict|commit|branch|git/i, fine: "git", w: 0.3 },
    { re: /endpoint|fetch|api\s|timeout|cors/i, fine: "api", w: 0.28 },
    { re: /query|دیتابیس|migration|database|sql\b/i, fine: "database", w: 0.3 },
    { re: /css|dom|responsive|layout|کامپوننت|ui\b/i, fine: "ui", w: 0.28 },
    { re: /معماری|architecture|coupling|ماژول‌بندی/i, fine: "architecture", w: 0.3 },
    { re: /بازبینی|review\s*کن|code\s*review|ریویو/i, fine: "review", w: 0.28 },
  ];

  let _ready = false;
  let _loading = null;
  let terminology = {};
  let aliases = {};
  let intentIndex = [];
  let termTokens = new Map();
  let labelKeywordIndex = {}; // fine → Set of distinctive tokens

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

  /** Overlap ratio favoring query coverage (good for short Persian messages) */
  function coverage(querySet, docSet) {
    if (!querySet.size) return 0;
    let hit = 0;
    for (const x of querySet) if (docSet.has(x)) hit++;
    return hit / querySet.size;
  }

  async function load() {
    if (_ready) return true;
    if (_loading) return _loading;
    _loading = (async () => {
      try {
        const res = await fetch(DATASET_URL + "?v=4.0.1");
        if (!res.ok) throw new Error("dataset HTTP " + res.status);
        const data = await res.json();
        terminology = data.terminology || {};
        aliases = data.aliases || {};
        termTokens.clear();
        for (const [fa, meta] of Object.entries(terminology)) {
          const key = normalize(fa);
          const payload = { fa, en: meta.en || "", description: meta.description || "" };
          termTokens.set(key, payload);
          if (meta.en) termTokens.set(normalize(meta.en), payload);
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
        // Distinctive keywords per label (tokens that appear often in that label)
        labelKeywordIndex = {};
        const df = {};
        for (const item of intentIndex) {
          if (!labelKeywordIndex[item.label]) labelKeywordIndex[item.label] = {};
          for (const tok of item.tokens) {
            labelKeywordIndex[item.label][tok] = (labelKeywordIndex[item.label][tok] || 0) + 1;
            df[tok] = (df[tok] || 0) + 1;
          }
        }
        _ready = true;
        return true;
      } catch (err) {
        console.warn("[Knowledge] load failed:", err && err.message);
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

  function extractTerms(text) {
    if (!_ready) return [];
    const n = normalize(text);
    const hits = [];
    const seen = new Set();
    // Longer keys first for multi-word terms
    const keys = [...termTokens.keys()].sort((a, b) => b.length - a.length);
    for (const key of keys) {
      if (key.length < 2) continue;
      if (n.includes(key) && !seen.has(termTokens.get(key).fa)) {
        seen.add(termTokens.get(key).fa);
        hits.push(termTokens.get(key));
      }
    }
    return hits;
  }

  function matchIntent(text, opts) {
    opts = opts || {};
    const prevFine = opts.prevFine || null;
    const terms = extractTerms(text);
    const q = tokenize(text);
    const n = normalize(text);

    if (!_ready || !intentIndex.length) {
      // Still apply action priors offline without dataset
      for (const p of ACTION_PRIORS) {
        if (p.re.test(text)) {
          return {
            fine: p.fine,
            coarse: FINE_TO_COARSE[p.fine] || "general",
            confidence: 0.55,
            scores: { [p.fine]: p.w },
            terms,
            source: "prior-only",
          };
        }
      }
      return { fine: null, coarse: null, confidence: 0, scores: {}, terms, source: "none" };
    }

    const labelScores = {};
    const labelHits = {};

    for (const item of intentIndex) {
      const jac = jaccard(q, item.tokens);
      const cov = coverage(q, item.tokens);
      const sim = jac * 0.45 + cov * 0.55;
      if (sim < 0.1) continue;
      labelScores[item.label] = (labelScores[item.label] || 0) + sim;
      labelHits[item.label] = (labelHits[item.label] || 0) + 1;
    }

    let ranked = Object.keys(labelScores).map((lab) => {
      const avg = labelScores[lab] / Math.max(1, labelHits[lab]);
      const support = Math.min(1, labelHits[lab] / 6);
      return { label: lab, score: avg * 0.65 + support * 0.35 };
    });

    // Action priors
    for (const p of ACTION_PRIORS) {
      if (p.re.test(text)) {
        const row = ranked.find((r) => r.label === p.fine);
        if (row) row.score += p.w;
        else ranked.push({ label: p.fine, score: p.w });
      }
    }

    // Terminology boost
    for (const t of terms) {
      const blob = ((t.en || "") + " " + (t.fa || "")).toLowerCase();
      const bumps = [];
      if (/bug|error|debug|exception|traceback|باگ|خطا|دیباگ|استثنا/.test(blob)) bumps.push(["debug", 0.1], ["fix", 0.06]);
      if (/refactor|رفاکتور|بازنویسی|clean/.test(blob)) bumps.push(["refactor", 0.12]);
      if (/review|بازبینی|ریویو/.test(blob)) bumps.push(["review", 0.1]);
      if (/security|امنیت|xss|csrf|injection/.test(blob)) bumps.push(["security", 0.15]);
      if (/performance|بهینه|latency|memory/.test(blob)) bumps.push(["performance", 0.12]);
      if (/test|تست|assertion|coverage/.test(blob)) bumps.push(["test", 0.12]);
      if (/api|endpoint|fetch|http/.test(blob)) bumps.push(["api", 0.1]);
      if (/database|query|دیتابیس|sql/.test(blob)) bumps.push(["database", 0.1]);
      for (const [lab, w] of bumps) {
        const row = ranked.find((r) => r.label === lab);
        if (row) row.score += w;
        else ranked.push({ label: lab, score: w });
      }
    }

    // Continuity: slight boost to previous fine label on short follow-ups
    if (prevFine && /^(بیشتر|ادامه|ادامه بده|درستش کن|مثال|کدش|بده|کن|more|continue|fix)[\s!.،]*$/i.test(n)) {
      const row = ranked.find((r) => r.label === prevFine);
      if (row) row.score += 0.25;
      else ranked.push({ label: prevFine, score: 0.3 });
    }

    ranked.sort((a, b) => b.score - a.score);
    const top = ranked[0];
    if (!top || top.score < 0.14) {
      return {
        fine: null,
        coarse: null,
        confidence: 0,
        scores: Object.fromEntries(ranked.slice(0, 4).map((r) => [r.label, Math.round(r.score * 100) / 100])),
        terms,
        source: "low-score",
      };
    }

    const fine = top.label;
    const coarse = FINE_TO_COARSE[fine] || "general";
    const confidence = Math.min(0.96, 0.42 + top.score * 0.5);

    return {
      fine,
      coarse,
      confidence: Math.round(confidence * 100) / 100,
      scores: Object.fromEntries(ranked.slice(0, 4).map((r) => [r.label, Math.round(r.score * 100) / 100])),
      terms,
      source: "dataset",
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

  /** Build a short knowledge hint for mock/LLM context (not full dump) */
  function buildHint(text, opts) {
    const m = matchIntent(text, opts);
    const parts = [];
    if (m.fine) parts.push(`موضوع تخصصی: ${m.fine} → ${m.coarse || "?"}`);
    if (m.terms && m.terms.length) {
      parts.push("اصطلاحات: " + m.terms.slice(0, 5).map((t) => t.fa + "/" + t.en).join("، "));
    }
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
