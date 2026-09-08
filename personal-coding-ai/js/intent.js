/**
 * Intent Detection – context-aware, not pure keyword matching.
 */
const Intent = window.Intent = (() => {
  const CODE_HINT = /```|def\s+\w+|function\s+\w+|class\s+\w+|const\s+\w+|let\s+\w+|var\s+\w+|import\s+|from\s+\w+\s+import|public\s+class|fn\s+\w+|#include|console\.log|print\(|return\s+|async\s+|await\s+/i;
  const BUG_HINT = /\b(bug|error|exception|traceback|stack\s*trace|crash|fail|خطا|باگ|اشکال|مشکل)\b/i;
  const REFACTOR_HINT = /\b(refactor|clean|improve|optimize|تمیز|بهین|بازنویسی)\b/i;
  const EXPLAIN_HINT = /\b(explain|what\s+is|how\s+(does|to)|چیست|چیه|توضیح|چطور)\b/i;
  const GENERATE_HINT = /\b(write|create|generate|implement|بنویس|بساز|پیاده‌سازی|مثال)\b/i;
  const REVIEW_HINT = /\b(review|check|analyze|بررسی|تحلیل)\b/i;
  const GREETING = /^(سلام|hi|hello|hey|درود)[\s!.،,]*$/i;
  const INTRO = /خودت را معرفی|introduce yourself|who are you|کی هستی/i;
  const GENERAL_CHAT = /\b(چطوری|حالت|ممنون|مرسی|خداحافظ|bye|thanks|thank you|how are you)\b/i;

  function hasCodeInHistory(messages) {
    if (!messages || !messages.length) return false;
    return messages.some((m) => CODE_HINT.test(m.content || "") || (m.meta && m.meta.hasCode));
  }

  function hasUploadedFile(conv) {
    return !!(conv && conv.files && conv.files.length);
  }

  /**
   * @param {string} text
   * @param {{messages?: Array, files?: Array}} context
   * @returns {{intent: string, confidence: number, reason: string}}
   */
  function detect(text, context) {
    const t = (text || "").trim();
    const lower = t.toLowerCase();
    const msgs = (context && context.messages) || [];
    const files = (context && context.files) || [];
    const hasCode = CODE_HINT.test(t) || hasCodeInHistory(msgs);
    const hasFile = files.length > 0 || hasUploadedFile(context);

    if (!t) return { intent: "empty", confidence: 1, reason: "empty" };

    if (INTRO.test(t)) return { intent: "intro", confidence: 0.95, reason: "self-intro" };
    if (GREETING.test(t)) return { intent: "greeting", confidence: 0.9, reason: "greeting" };
    if (GENERAL_CHAT.test(t) && !hasCode && !BUG_HINT.test(t)) {
      return { intent: "general", confidence: 0.85, reason: "casual chat" };
    }

    // File analysis when user refers to upload
    if (hasFile && /(این فایل|این کد|uploaded|file|analyze|بررسی فایل|تحلیل)/i.test(t)) {
      if (BUG_HINT.test(t)) return { intent: "debug", confidence: 0.9, reason: "debug uploaded file" };
      return { intent: "file-analysis", confidence: 0.88, reason: "analyze uploaded file" };
    }

    if (BUG_HINT.test(t) && (hasCode || hasFile || CODE_HINT.test(t))) {
      return { intent: "debug", confidence: 0.9, reason: "bug report with code context" };
    }
    if (BUG_HINT.test(t) && !hasCode && !hasFile) {
      return { intent: "debug", confidence: 0.7, reason: "bug mention without code" };
    }

    if (REFACTOR_HINT.test(t)) return { intent: "refactor", confidence: 0.85, reason: "refactor request" };
    if (REVIEW_HINT.test(t) && (hasCode || hasFile || CODE_HINT.test(t))) {
      return { intent: "code-review", confidence: 0.85, reason: "code review" };
    }
    if (CODE_HINT.test(t) && REVIEW_HINT.test(t)) return { intent: "code-review", confidence: 0.9, reason: "code + review" };
    if (CODE_HINT.test(t) && GENERATE_HINT.test(t) === false && !EXPLAIN_HINT.test(t)) {
      return { intent: "code-review", confidence: 0.75, reason: "code pasted" };
    }
    if (GENERATE_HINT.test(t) && (/\b(code|function|class|script|کد|تابع|کلاس)\b/i.test(t) || hasCode)) {
      return { intent: "code-generation", confidence: 0.85, reason: "generate code" };
    }
    if (EXPLAIN_HINT.test(t) && (hasCode || /\b(python|javascript|react|api|کد|برنامه)\b/i.test(t))) {
      return { intent: "explain", confidence: 0.8, reason: "programming explanation" };
    }
    if (EXPLAIN_HINT.test(t) && !hasCode && !hasFile) {
      return { intent: "general", confidence: 0.7, reason: "general question" };
    }

    // Programming question without forcing code analysis
    if (/\b(python|javascript|typescript|react|node|django|fastapi|html|css|sql|git)\b/i.test(t)) {
      return { intent: "programming", confidence: 0.75, reason: "tech topic" };
    }

    if (hasCode) return { intent: "code-review", confidence: 0.65, reason: "contains code" };

    return { intent: "general", confidence: 0.6, reason: "default general" };
  }

  return { detect };
})();
