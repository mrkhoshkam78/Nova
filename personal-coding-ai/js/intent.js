/**
 * Intent Detection – Multi-signal scoring, context-aware (offline / client-side only)
 * Version 4.1.0 – Stronger Persian + English coverage, history-aware, confidence calibration
 */
const Intent = window.Intent = (() => {
  // ── Code presence signals ──────────────────────────────────────────────
  const CODE_HINT = /```[\s\S]*?```|def\s+\w+\s*\(|function\s+\w+\s*\(|class\s+\w+|const\s+\w+\s*=|let\s+\w+\s*=|var\s+\w+\s*=|import\s+[\w{]|from\s+[\w.]+\s+import|public\s+(class|static|void)|fn\s+\w+|#include\s*<|console\.(log|error|warn)|print\s*\(|return\s+[^;]+;|async\s+function|await\s+\w+|=>\s*[{(]|interface\s+\w+|type\s+\w+\s*=/i;

  const CODE_BLOCK = /```[\s\S]{10,}```/;
  const SHORT_CODE = /(def\s+\w+|function\s+\w+|class\s+\w+|const\s+\w+|import\s+|print\(|console\.log)/i;

  // ── Bug / Debug signals (strong Persian + English) ─────────────────────
  const BUG_STRONG = /(traceback|stack\s*trace|exception|TypeError|ValueError|AttributeError|KeyError|IndexError|NullPointer|segfault|crash|panic|unhandled|failed\s+to|cannot\s+read|is\s+not\s+defined|undefined\s+is\s+not|خطای\s+زمان\s+اجرا|استثنا|ترِیس‌بک|ترِیس\s*بک)/i;
  const BUG_MEDIUM = /(bug|error|exception|fail(ed|ure)?|broken|not\s+working|doesn't\s+work|wrong\s+result|unexpected|باگ|خطا|اشکال|کار\s*نمی\s*کنه|کار\s*نمیکنه|درست\s*کار\s*نمیکنه|خراب\s*شده|اشتباه\s*می\s*ده)/i;
  const BUG_WEAK   = /(چرا\s+این|چرا\s+اینطوری|چی\s+شده|چی\s+میشه|why\s+(is|does)|what.?s\s+wrong)/i;

  // ── Other intents ──────────────────────────────────────────────────────
  const REFACTOR   = /(refactor|clean\s*up|improve|optimize|performance|تمیز|بهینه|بازنویسی|بهتر\s*کن|سریع‌تر|خواناتر)/i;
  const EXPLAIN    = /(explain|what\s+is|how\s+(does|to|can)|چیست|چیه\s*\؟|توضیح\s*(بده|کن)|معنی|مفهوم|how\s+it\s+works|چطور\s*کار\s*می)/i;
  const GENERATE   = /(write|create|generate|implement|make|build|بنویس|بساز|پیاده‌سازی|مثال\s+بزن|کد\s+بده|کد\s+بنویس|sample|snippet)/i;
  const REVIEW     = /(review|check|analyze|look\s+at|بررسی|تحلیل|نقد|نظر\s+بده|چطوره|خوبه\s*؟)/i;
  const FIX_HINT   = /(fix|repair|solve|resolve|درست\s*کن|رفع\s*کن|حل\s*کن|درمان)/i;
  const CONVERT    = /(convert|translate|to\s+(python|js|ts|java|go|rust)|تبدیل|به\s+(پایتون|جاوااسکریپت))/i;
  const GREETING   = /^(سلام|درود|hi|hello|hey|صبح\s*بخیر|عصر\s*بخیر)[\s!.،,]*$/i;
  const INTRO      = /(خودت\s*را\s*معرفی|introduce\s+yourself|who\s+are\s+you|کی\s*هستی|اسمت\s*چیه|تو\s*کی\s*هستی)/i;
  const GENERAL    = /(چطوری|حالت\s*خوبه|خوبی|ممنون|مرسی|خداحافظ|bye|thanks|thank\s+you|how\s+are\s+you|خسته\s*نباشی)/i;
  const TECH_TOPIC = /\b(python|javascript|typescript|react|vue|angular|node\.?js|django|fastapi|flask|express|html|css|sql|git|docker|kubernetes|api|rest|graphql|async|await|promise|hook|component)\b/i;

  // ── Helpers ────────────────────────────────────────────────────────────
  function hasCodeInHistory(messages) {
    if (!Array.isArray(messages) || !messages.length) return false;
    // Look at last 6 messages only (recent context)
    const recent = messages.slice(-6);
    return recent.some((m) => {
      const c = m.content || "";
      return CODE_HINT.test(c) || CODE_BLOCK.test(c) || (m.meta && m.meta.hasCode);
    });
  }

  function lastUserIntent(messages) {
    if (!Array.isArray(messages)) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === "user" && m.meta && m.meta.intent) return m.meta.intent;
    }
    return null;
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  /**
   * Multi-signal scoring engine
   * @param {string} text
   * @param {{messages?: Array, files?: Array}} context
   * @returns {{intent: string, confidence: number, reason: string, scores?: Object}}
   */
  function detect(text, context) {
    const t = (text || "").trim();
    if (!t) return { intent: "empty", confidence: 1, reason: "empty input" };

    const _lang = window.LangCtx ? LangCtx.analyze(t) : null;
    if (_lang && (_lang.isMeta || (_lang.isPureChat && _lang.surface !== "code" && _lang.surface !== "mixed" && _lang.surface !== "error_log"))) {
      // Pure conversation — never open as debug/review unless explicit coding intent words + code
      if (!_lang.requestDebug && !_lang.hasCode && !_lang.hasErrorLog) {
        if (GREETING.test(t) || (_lang.surface === "meta")) {
          return { intent: GREETING.test(t) ? "greeting" : "general", confidence: 0.95, reason: "pure-chat/meta", fine: null, lang: _lang };
        }
        // still allow explain/generate keywords on pure chat below — but block debug defaults
      }
    }
    if (_lang && _lang.isMeta) {
      return { intent: "general", confidence: 0.95, reason: "meta-status-question", fine: null, lang: _lang };
    }
    if (/^(دیباگ\s*کردی|دیباگ\s*شد|درست\s*شد|اوکی\s*شد|فهمیدی|متوجه\s*شدی|did\s+you\s+debug|is\s+it\s+fixed|worked)[\s!.؟،]*$/i.test(t)) {
      return { intent: "general", confidence: 0.92, reason: "meta-status-question", fine: null };
    }

    const msgs = (context && context.messages) || [];
    const files = (context && context.files) || [];
    const hasFile = files.length > 0;
    const langInfo = _lang || (window.LangCtx ? LangCtx.analyze(t) : null);
    const prose = langInfo ? langInfo.prose : t;
    const hasCodeNow = (langInfo && langInfo.hasCode) || CODE_HINT.test(t) || CODE_BLOCK.test(t) || SHORT_CODE.test(t);
    const hasCodeHist = hasCodeInHistory(msgs);
    // Intent keyword tests run on prose for chat words; code detection uses full text / langInfo
    const hasCode = hasCodeNow || hasCodeHist;
    const prevIntent = lastUserIntent(msgs);

    // ── Hard early exits ─────────────────────────────────────────────────
    if (INTRO.test(t)) {
      return { intent: "intro", confidence: 0.96, reason: "self-introduction request" };
    }
    if (GREETING.test(t)) {
      return { intent: "greeting", confidence: 0.94, reason: "greeting" };
    }
    if (GENERAL.test(t) && !hasCode && !BUG_MEDIUM.test(t) && !TECH_TOPIC.test(t)) {
      return { intent: "general", confidence: 0.88, reason: "casual / social chat" };
    }

    // ── Score table ──────────────────────────────────────────────────────
    const scores = {
      debug: 0,
      "code-review": 0,
      refactor: 0,
      "code-generation": 0,
      explain: 0,
      "file-analysis": 0,
      convert: 0,
      programming: 0,
      general: 0.15, // small base
    };

    const reasons = [];

    // --- Debug signals ---
    if (BUG_STRONG.test(t)) {
      scores.debug += 0.55;
      reasons.push("strong error/traceback");
    }
    if (BUG_MEDIUM.test(t)) {
      scores.debug += 0.35;
      reasons.push("bug/error keyword");
    }
    if (BUG_WEAK.test(t)) {
      scores.debug += 0.18;
      reasons.push("why-is-this-wrong phrasing");
    }
    if (FIX_HINT.test(t) && (hasCode || BUG_MEDIUM.test(t) || BUG_STRONG.test(t))) {
      scores.debug += 0.25;
      reasons.push("fix + code/bug context");
    }
    if (hasCode && (BUG_MEDIUM.test(t) || BUG_STRONG.test(t) || FIX_HINT.test(t))) {
      scores.debug += 0.22;
    }
    if (hasFile && (BUG_MEDIUM.test(t) || BUG_STRONG.test(t))) {
      scores.debug += 0.18;
      reasons.push("uploaded file + bug");
    }

    // --- Code review ---
    if (REVIEW.test(t) && (hasCode || hasFile || hasCodeNow)) {
      scores["code-review"] += 0.48;
      reasons.push("review + code/file");
    }
    if (hasCodeNow && !GENERATE.test(t) && !EXPLAIN.test(t) && !BUG_MEDIUM.test(t)) {
      scores["code-review"] += 0.32;
      reasons.push("code pasted without generate/explain");
    }
    if (hasCodeHist && REVIEW.test(t)) {
      scores["code-review"] += 0.15;
    }

    // --- Refactor ---
    if (REFACTOR.test(t)) {
      scores.refactor += 0.55;
      reasons.push("refactor/optimize keyword");
      if (hasCode || hasFile) scores.refactor += 0.2;
    }

    // --- Generate ---
    if (GENERATE.test(t)) {
      scores["code-generation"] += 0.45;
      reasons.push("generate/write keyword");
      if (/\b(code|function|class|script|component|hook|کد|تابع|کلاس|کامپوننت)\b/i.test(t) || hasCode) {
        scores["code-generation"] += 0.25;
      }
    }

    // --- Explain ---
    if (EXPLAIN.test(t)) {
      // If clear bug signals, do not let "چرا/توضیح" steal debug intent
      const bugHeavy = BUG_STRONG.test(t) || BUG_MEDIUM.test(t) || FIX_HINT.test(t);
      if (bugHeavy) {
        scores.explain += 0.12;
        scores.debug += 0.15;
        reasons.push("explain keyword under bug context → prefer debug");
      } else {
        scores.explain += 0.4;
        reasons.push("explain/how/what keyword");
        if (hasCode || hasFile || TECH_TOPIC.test(t)) {
          scores.explain += 0.25;
        } else {
          scores.explain += 0.05;
        }
      }
    }

    // Mixed FA chat + code fence: mild code-review boost if no bug verbs
    if (langInfo && langInfo.surface === "mixed" && !BUG_STRONG.test(t) && !FIX_HINT.test(t)) {
      scores["code-review"] += 0.12;
      reasons.push("mixed FA+code surface");
    }
    if (langInfo && langInfo.surface === "fa_chat" && !hasCode && !hasFile && scores.debug > 0 && scores.debug < 0.45) {
      // casual FA without evidence → dampen weak debug
      scores.debug *= 0.55;
      reasons.push("fa_chat dampen weak debug");
    }

    // --- File analysis ---
    if (hasFile && /(این\s*فایل|این\s*کد|uploaded|file|analyze|بررسی\s*فایل|تحلیل\s*فایل|اینو\s*ببین)/i.test(t)) {
      scores["file-analysis"] += 0.5;
      reasons.push("reference to uploaded file");
      if (BUG_MEDIUM.test(t) || BUG_STRONG.test(t)) {
        scores.debug += 0.3; // prefer debug when bug + file
      }
    }

    // --- Convert ---
    if (CONVERT.test(t)) {
      scores.convert += 0.6;
      reasons.push("language conversion request");
      if (hasCode) scores.convert += 0.2;
    }

    // --- Programming topic ---
    if (TECH_TOPIC.test(t) && scores.debug < 0.3 && scores["code-generation"] < 0.3) {
      scores.programming += 0.4;
      reasons.push("tech topic mentioned");
    }

    // --- Continuity boost from previous intent ---
    if (prevIntent) {
      if (prevIntent === "debug" && (BUG_MEDIUM.test(t) || FIX_HINT.test(t) || /ادامه|همین|this|more|بیشتر|دیگه|درستش|رفعش/i.test(t))) {
        scores.debug += 0.28;
        reasons.push("continues previous debug");
      }
      if (prevIntent === "code-review" && (REVIEW.test(t) || /همین|this|more|بیشتر|اینو|کدش/i.test(t))) {
        scores["code-review"] += 0.22;
        reasons.push("continues previous review");
      }
      if (prevIntent === "code-generation" && (GENERATE.test(t) || /ادامه|بیشتر|add|also|مثال|کدش/i.test(t))) {
        scores["code-generation"] += 0.22;
        reasons.push("continues previous generation");
      }
      if (prevIntent === "explain" && /بیشتر|ادامه|مثال|توضیح|more|continue/i.test(t)) {
        scores.explain += 0.25;
        reasons.push("continues previous explain");
      }
    }

    // Short Persian follow-ups without clear keyword → boost last coding intent via history
    const isShortFa = /^(بیشتر|ادامه|ادامه بده|بیشتر بگو|مثال|مثال بزن|کدش|کدشو|درستش کن|درست کن|رفعش کن|توضیح بده|بده|کن)[\s!.،]*$/i.test(t.trim());
    if (isShortFa && prevIntent && scores[prevIntent] !== undefined) {
      scores[prevIntent] = (scores[prevIntent] || 0) + 0.35;
      reasons.push("short Persian follow-up → " + prevIntent);
    }

    // Anaphora pointing at code
    if (/این کد|همین کد|کدش|کدشو|اینو ببین|همین رو/i.test(t)) {
      if (FIX_HINT.test(t) || BUG_MEDIUM.test(t)) {
        scores.debug += 0.3;
        reasons.push("anaphora + fix/bug");
      } else {
        scores["code-review"] += 0.28;
        reasons.push("anaphora → code review");
      }
    }

    // ── Pure-chat dampening: chat surface must not win as debug/review without evidence ──
    if (langInfo && (langInfo.surface === "fa_chat" || langInfo.surface === "en_chat" || langInfo.surface === "meta")) {
      if (!hasCodeNow && !hasFile && !hasCodeHist) {
        scores.debug *= 0.25;
        scores["code-review"] *= 0.35;
        scores.refactor *= 0.4;
        reasons.push("pure-chat dampen code intents");
      }
    }
    if (langInfo && langInfo.surface === "code" && !langInfo.requestDebug) {
      scores["code-review"] += 0.15;
      reasons.push("code surface → review bias");
    }
    if (langInfo && langInfo.surface === "error_log") {
      scores.debug += 0.45;
      reasons.push("error_log surface");
    }

    // ── Knowledge dataset boost (offline terminology + labeled examples) ──
    let knowledgeMeta = null;
    if (window.Knowledge && Knowledge.isReady()) {
      try {
        const prevFine = lastUserIntent(msgs); // may be coarse; fine preferred from meta below
        let prevFineLabel = null;
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === "user" && msgs[i].meta && msgs[i].meta.fine) {
            prevFineLabel = msgs[i].meta.fine;
            break;
          }
        }
        const hasCodeCtx = hasCodeNow || hasCodeHist || hasFile;
        const hasErrCtx = BUG_STRONG.test(t) || BUG_MEDIUM.test(t);
        knowledgeMeta = Knowledge.matchIntent(t, {
          prevFine: prevFineLabel,
          hasCode: hasCodeCtx,
          hasError: hasErrCtx,
        });
        if (knowledgeMeta && knowledgeMeta.coarse && knowledgeMeta.confidence >= 0.45) {
          const coarse = knowledgeMeta.coarse;
          const conf = knowledgeMeta.confidence;
          if (scores[coarse] !== undefined) {
            scores[coarse] += 0.25 + conf * 0.35;
            reasons.push("dataset:" + (knowledgeMeta.fine || coarse));
          } else if (coarse === "code-review") {
            scores["code-review"] += 0.25 + conf * 0.35;
            reasons.push("dataset:" + (knowledgeMeta.fine || coarse));
          } else if (coarse === "debug") {
            scores.debug += 0.28 + conf * 0.35;
            reasons.push("dataset:" + (knowledgeMeta.fine || "debug"));
          } else if (coarse === "explain") {
            scores.explain += 0.22 + conf * 0.3;
            reasons.push("dataset:" + (knowledgeMeta.fine || "explain"));
          } else if (coarse === "refactor") {
            scores.refactor += 0.25 + conf * 0.3;
            reasons.push("dataset:refactor");
          }
        }
        // terminology-only nudge
        if (knowledgeMeta && knowledgeMeta.terms && knowledgeMeta.terms.length) {
          const joined = knowledgeMeta.terms.map((x) => (x.en || "") + " " + (x.fa || "")).join(" ").toLowerCase();
          if (/bug|error|debug|exception|باگ|خطا|دیباگ/.test(joined)) {
            scores.debug += 0.12;
            reasons.push("term:debug");
          }
          if (/refactor|رفاکتور|بازنویسی/.test(joined)) {
            scores.refactor += 0.12;
            reasons.push("term:refactor");
          }
          if (/review|بازبینی|ریویو/.test(joined)) {
            scores["code-review"] += 0.1;
            reasons.push("term:review");
          }
        }
      } catch (_) { /* knowledge optional */ }
    }

    // ── Pick winner ──────────────────────────────────────────────────────
    let bestIntent = "general";
    let bestScore = scores.general;

    for (const [intent, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestIntent = intent;
      }
    }

    // Confidence calibration
    let confidence = clamp(0.45 + bestScore * 0.55, 0.5, 0.97);

    // Special overrides for clarity
    if (bestIntent === "debug" && (BUG_STRONG.test(t) || (hasCode && BUG_MEDIUM.test(t)))) {
      confidence = Math.max(confidence, 0.88);
    }
    if (bestIntent === "general" && !TECH_TOPIC.test(t) && !hasCode) {
      confidence = Math.min(confidence, 0.75);
    }

    // If almost everything is low → general
    if (bestScore < 0.28) {
      bestIntent = "general";
      confidence = 0.55;
      reasons.push("low signal → general");
    }

    const reason = reasons.length ? reasons.slice(0, 3).join(" + ") : "default scoring";

    return {
      intent: bestIntent,
      confidence: Math.round(confidence * 100) / 100,
      reason,
      scores,
      fine: knowledgeMeta && knowledgeMeta.fine ? knowledgeMeta.fine : null,
      knowledge: knowledgeMeta || null,
    };
  }

  return { detect };
})();
