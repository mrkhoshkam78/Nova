/**
 * langctx.js – Nova V4.1.0
 * Message surface classifier: fa_chat | en_chat | code | mixed | meta | error_log
 * Goal: never confuse conversation with code, or code with casual chat.
 */
const LangCtx = window.LangCtx = (() => {
  const VERSION = "4.1.0";

  const FA = /[\u0600-\u06FF]/;
  const FENCE_RE = /```(?:([\w+-]*)\n)?([\s\S]*?)```/g;
  const INLINE_CODE = /`[^`\n]{2,120}`/g;

  // Line-start code cues (unfenced paste)
  const CODE_LINE_START =
    /^(?:#{1,3}\s*!|def\s+\w|class\s+\w|function\s+\w|async\s+function|const\s+\w|let\s+\w|var\s+\w|import\s+|from\s+\S+\s+import|export\s+|public\s+|private\s+|protected\s+|static\s+|fn\s+\w|func\s+\w|package\s+\w|#include|using\s+|typedef\s+|interface\s+\w|type\s+\w+\s*=|enum\s+\w|struct\s+\w|impl\s+|trait\s+|printf\s*\(|cout\s*<<|System\.out|console\.(log|error|warn|debug)|print\s*\(|return\s+[^;]{0,80};|if\s*\([^)]+\)\s*\{|for\s*\([^)]+\)\s*\{|while\s*\([^)]+\)\s*\{|try\s*\{|catch\s*\(|except\s+|elif\s+|else\s*:|@\w+|=>\s*[{(]|<\/?[a-zA-Z][\w:-]*|SELECT\s+|INSERT\s+|UPDATE\s+|DELETE\s+FROM)/im;

  const CODE_DENSITY_TOKENS =
    /[{};=]|===|!==|=>|::|\->|\bnull\b|\bundefined\b|\bNone\b|\btrue\b|\bfalse\b|\bTrue\b|\bFalse\b|\bself\b|\bthis\b|\bnew\s+\w|\bawait\b|\byield\b/g;

  const ERROR_LOG =
    /Traceback \(most recent call last\)|Error:\s+\w|Exception:\s+\w|FATAL ERROR|TypeError:|ValueError:|ReferenceError:|SyntaxError:|NullPointerException|segfault|panic:|E\d{4}:|npm ERR!|yarn error|FAILED|AssertionError/i;

  const STACK_FRAME =
    /^\s+at\s+\S+|File\s+"[^"]+",\s+line\s+\d+|^\s+File\s+"/m;

  const META_STATUS =
    /^(دیباگ\s*کردی|دیباگ\s*شد|درست\s*شد|اوکی\s*شد|اوکی|باشه|فهمیدی|متوجه\s*شدی|ممنون|مرسی|thanks|thank\s*you|ok|okay|done|did\s+you\s+debug|is\s+it\s+fixed|worked|خوبه|عالی)[\s!.؟،]*$/i;

  const CHAT_ONLY_FA =
    /^(سلام|درود|خوبی|چطوری|حالت|ممنون|مرسی|خداحافظ|شب\s*بخیر|صبح\s*بخیر|بای|hi|hello|hey)[\s!.؟،]*$/i;

  const REQUEST_DEBUG_FA =
    /دیباگ\s*کن|دیباگش\s*کن|این\s*باگ|باگ\s*داره|خطا\s*می\s*ده|کار\s*نمی\s*کنه|کار\s*نمیکنه|درست\s*کار\s*نمی|رفع\s*کن|درستش\s*کن/i;

  const REQUEST_DEBUG_EN =
    /\b(debug\s+(this|it)|fix\s+(this|it|the\s+bug)|not\s+working|throws?\s+an?\s+error|crashes?)\b/i;

  const PURE_CONCEPT_FA =
    /^(تفاوت|فرق|یعنی\s*چه|چیست|چیه|توضیح\s*بده|معنی)\b/i;

  function extractFences(text) {
    const out = [];
    const re = /```(?:([\w+-]*)\n)?([\s\S]*?)```/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      out.push({ lang: (m[1] || "").toLowerCase(), body: (m[2] || "").trim() });
    }
    return out;
  }

  function stripCode(text) {
    return String(text || "")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`[^`\n]{1,120}`/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function countMatches(re, s) {
    const m = String(s || "").match(re);
    return m ? m.length : 0;
  }

  function lineStats(text) {
    const lines = String(text || "").split(/\r?\n/);
    let codeish = 0;
    let total = 0;
    for (const line of lines) {
      const L = line.trim();
      if (!L) continue;
      total++;
      if (CODE_LINE_START.test(L) || /[{};]\s*$/.test(L) || /^\s*\/\//.test(L) || /^\s*#/.test(L)) {
        codeish++;
      }
    }
    return { total, codeish, ratio: total ? codeish / total : 0 };
  }

  function analyze(text) {
    const raw = String(text || "");
    const t = raw.trim();
    const fences = extractFences(t);
    const hasFence = fences.length > 0;
    const fenceChars = fences.reduce((n, f) => n + (f.body || "").length, 0);
    const prose = stripCode(t);
    const fa = countMatches(/[\u0600-\u06FF]/g, prose);
    const en = countMatches(/[A-Za-z]/g, prose);
    const digits = countMatches(/\d/g, prose);
    const ls = lineStats(hasFence ? prose : t);
    const density = countMatches(CODE_DENSITY_TOKENS, hasFence ? t : t);
    const hasErrorLog = ERROR_LOG.test(t) || STACK_FRAME.test(t);
    const hasCodeLine = !hasFence && (ls.ratio >= 0.35 || CODE_LINE_START.test(t));
    // Unfenced block: many symbols + short words
    const unfencedBlock =
      !hasFence &&
      t.length > 40 &&
      density >= 4 &&
      ls.codeish >= 2 &&
      ls.ratio >= 0.25;

    const hasCode = hasFence || hasCodeLine || unfencedBlock || (hasErrorLog && density >= 2);
    const isMeta = META_STATUS.test(t) || CHAT_ONLY_FA.test(t);
    const isPureChat =
      isMeta ||
      (!hasCode &&
        !hasErrorLog &&
        prose.length < 120 &&
        !REQUEST_DEBUG_FA.test(prose) &&
        !REQUEST_DEBUG_EN.test(prose) &&
        (fa + en) > 0 &&
        density <= 1);

    let surface = "unknown";
    if (isMeta && !hasCode) surface = "meta";
    else if (hasErrorLog && !hasFence && fa < 8) surface = "error_log";
    else if (hasCode && (fa > 5 || REQUEST_DEBUG_FA.test(prose))) surface = "mixed";
    else if (hasCode) surface = "code";
    else if (fa > en * 0.5 && fa > 0) surface = "fa_chat";
    else if (en > 0) surface = "en_chat";
    else surface = "fa_chat";

    // Confidence 0–1 for classification
    let conf = 0.5;
    if (surface === "meta") conf = 0.95;
    else if (surface === "code" && hasFence) conf = 0.92;
    else if (surface === "code" && unfencedBlock) conf = 0.75;
    else if (surface === "mixed") conf = 0.85;
    else if (surface === "error_log") conf = 0.88;
    else if (surface === "fa_chat" || surface === "en_chat") conf = isPureChat ? 0.9 : 0.7;

    return {
      version: VERSION,
      surface,
      confidence: conf,
      hasCode,
      hasFence,
      hasErrorLog,
      isMeta,
      isPureChat,
      faChars: fa,
      enChars: en,
      digitChars: digits,
      prose,
      fences,
      fenceChars,
      codeLineRatio: ls.ratio,
      density,
      preferReplyLang: fa >= en ? "fa" : "en",
      requestDebug: REQUEST_DEBUG_FA.test(prose) || REQUEST_DEBUG_EN.test(prose),
      pureConcept: PURE_CONCEPT_FA.test(prose) && !hasCode,
    };
  }

  function looksLikeBugReport(text, opts) {
    opts = opts || {};
    const a = analyze(text);
    if (a.isMeta) return false;
    if (a.surface === "fa_chat" && a.isPureChat && !opts.hasPrevCode && !opts.hasFile) return false;
    if (a.surface === "en_chat" && a.isPureChat && !opts.hasPrevCode && !opts.hasFile) return false;
    if (a.hasFence && a.fenceChars >= 8) return true;
    if (a.surface === "error_log" || a.hasErrorLog) return true;
    if (a.surface === "code" && a.requestDebug) return true;
    if (a.surface === "mixed" && (a.requestDebug || a.hasErrorLog)) return true;
    if (a.requestDebug && (opts.hasPrevCode || opts.hasFile || a.hasCode)) return true;
    if (
      /کار\s*نمی\s*کنه|کار\s*نمیکنه|باگ\s*داره|خطا\s*می\s*ده|not\s+working|throws?/i.test(a.prose) &&
      (opts.hasPrevCode || opts.hasFile || a.prose.length > 50)
    ) {
      return true;
    }
    return false;
  }

  /** Prefer code body for debugger; prose for chat intent */
  function splitMessage(text) {
    const a = analyze(text);
    const codeParts = a.fences.map((f) => f.body).filter(Boolean);
    if (!codeParts.length && a.hasCode && a.surface === "code") {
      codeParts.push(String(text || "").trim());
    }
    return {
      prose: a.prose,
      code: codeParts.join("\n\n"),
      languages: a.fences.map((f) => f.lang).filter(Boolean),
      analysis: a,
    };
  }

  function shouldRunDebugger(text, conv) {
    const hasFile = !!(conv && conv.files && conv.files.length);
    const hasPrevCode = !!(
      conv &&
      conv.messages &&
      conv.messages.some((m) => /```[\s\S]{8,}```/.test(m.content || "") || (m.meta && m.meta.hasCode))
    );
    return looksLikeBugReport(text, { hasFile, hasPrevCode });
  }

  return {
    VERSION,
    analyze,
    stripCode,
    extractFences,
    looksLikeBugReport,
    splitMessage,
    shouldRunDebugger,
    META_STATUS,
  };
})();
