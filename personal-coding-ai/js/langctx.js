/**
 * langctx.js – Nova V4.0.9
 * Distinguish Persian chat / English chat / code / mixed messages (offline).
 */
const LangCtx = window.LangCtx = (() => {
  const FA_CHAR = /[\u0600-\u06FF]/;
  const CODE_FENCE = /```[\s\S]*?```/;
  const CODE_LINE = /^(?:def |function |class |const |let |var |import |from |print\(|console\.|#include|public |fn |async )/m;
  const META_STATUS = /^(دیباگ\s*کردی|دیباگ\s*شد|درست\s*شد|اوکی\s*شد|فهمیدی|متوجه\s*شدی|did\s+you\s+debug|is\s+it\s+fixed|worked)[\s!.؟،]*$/i;

  function stripCode(text) {
    return String(text || "").replace(/```[\s\S]*?```/g, " ").replace(/\s+/g, " ").trim();
  }

  function analyze(text) {
    const raw = String(text || "");
    const t = raw.trim();
    const withoutCode = stripCode(t);
    const fa = (withoutCode.match(/[\u0600-\u06FF]/g) || []).length;
    const en = (withoutCode.match(/[A-Za-z]/g) || []).length;
    const hasFence = CODE_FENCE.test(t);
    const hasCodeLine = CODE_LINE.test(t);
    const hasCode = hasFence || hasCodeLine;
    const isMeta = META_STATUS.test(t);
    let surface = "unknown";
    if (isMeta) surface = "meta";
    else if (hasCode && fa > 2) surface = "mixed"; // FA chat + code
    else if (hasCode && en >= fa) surface = "code";
    else if (hasCode) surface = "code";
    else if (fa > en * 0.6 && fa > 0) surface = "fa_chat";
    else if (en > fa) surface = "en_chat";
    else if (fa > 0) surface = "fa_chat";
    else surface = "en_chat";

    return {
      surface,
      hasCode,
      hasFence,
      isMeta,
      faChars: fa,
      enChars: en,
      prose: withoutCode,
      preferReplyLang: fa >= en ? "fa" : "en",
    };
  }

  /** Whether text looks like a real bug report (not status chat) */
  function looksLikeBugReport(text, opts) {
    opts = opts || {};
    const a = analyze(text);
    if (a.isMeta) return false;
    if (a.hasFence) return true;
    const t = a.prose;
    if (/traceback|stack\s*trace|TypeError|ValueError|NullPointer|Exception:|Error:/i.test(text)) return true;
    if (/کار\s*نمی\s*کنه|کار\s*نمیکنه|باگ\s*داره|خطا\s*می\s*ده|crash|not\s+working/i.test(t) && (opts.hasPrevCode || opts.hasFile || t.length > 45)) {
      return true;
    }
    if (/دیباگ\s*کن|debug\s+(this|it)|این\s*باگ|fix\s+this/i.test(t) && (opts.hasPrevCode || opts.hasFile || a.hasCode)) {
      return true;
    }
    return false;
  }

  return { analyze, stripCode, looksLikeBugReport, META_STATUS };
})();
