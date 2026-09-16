/**
 * chat.js – Conversation state + message rendering + Context-aware Mock AI
 */

const Chat = window.Chat = (() => {
  let conversations = [];
  let activeId = null;
  let isProcessing = false;

  const STORAGE_KEY = "nova_conversations_v1";

  let _saveTimer = null;

  function compactConversationsForStorage() {
    // Truncate large file bodies to keep localStorage fast and under quota
    return conversations.map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      messages: c.messages,
      files: (c.files || []).map((f) => ({
        id: f.id,
        name: f.name,
        size: f.size,
        type: f.type,
        ext: f.ext,
        language: f.language,
        kind: f.kind,
        content: typeof f.content === "string" ? f.content.slice(0, 40000) : "",
      })),
    }));
  }

  function saveToStorageImmediate() {
    try {
      const payload = { conversations: compactConversationsForStorage(), activeId };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (_) {
      // private mode / quota – ignore
    }
  }

  function saveToStorage() {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(saveToStorageImmediate, 120);
  }

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.conversations)) return false;
      conversations = data.conversations.map((c) => ({
        ...c,
        files: Array.isArray(c.files) ? c.files : [],
        messages: Array.isArray(c.messages) ? c.messages : [],
      }));
      activeId = data.activeId || (conversations[0] && conversations[0].id) || null;
      return conversations.length > 0;
    } catch (_) {
      return false;
    }
  }

  // ---------- Helpers ----------
  function generateId() {
    return "c_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  const _escMap = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function escapeHtml(text) {
    return String(text || "").replace(/[&<>"']/g, (ch) => _escMap[ch]);
  }

  /**
   * Lightweight safe markdown-ish renderer:
   * - **bold**
   * - `inline code`
   * - ```code blocks```
   * - newlines → <br>
   * All user/AI content is escaped before injection (XSS-safe).
   */
  function renderContent(raw) {
    if (!raw) return "";

    const blocks = [];
    let text = raw.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      const id = blocks.length;
      blocks.push({ lang: lang || "text", code: code.trimEnd() });
      return `\n%%CODEBLOCK_${id}%%\n`;
    });

    text = escapeHtml(text);
    text = text.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
    text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/\n/g, "<br>");

    text = text.replace(/%%CODEBLOCK_(\d+)%%/g, (_, idx) => {
      const b = blocks[Number(idx)];
      const codeHtml = escapeHtml(b.code);
      return `
        <div class="code-block">
          <div class="code-header">
            <span class="code-lang">${escapeHtml(b.lang)}</span>
            <button type="button" class="copy-btn" data-code="${encodeURIComponent(b.code)}" title="Copy code">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              <span>Copy</span>
            </button>
          </div>
          <pre><code>${codeHtml}</code></pre>
        </div>
      `;
    });

    return text;
  }

  function createMessageElement(role, content, isLoading = false) {
    const wrapper = document.createElement("div");
    wrapper.className = `message message-${role}`;

    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = role === "user" ? "U" : "N";

    const body = document.createElement("div");
    body.className = "message-body";

    if (isLoading) {
      body.innerHTML = `
        <div class="typing-indicator" aria-label="Nova is thinking">
          <span></span><span></span><span></span>
        </div>
      `;
    } else {
      body.innerHTML = renderContent(content);
    }

    wrapper.appendChild(avatar);
    wrapper.appendChild(body);
    return wrapper;
  }

  // ---------- Conversation management ----------
  function getActive() {
    return conversations.find((c) => c.id === activeId) || null;
  }

  function createConversation(title = "New Chat") {
    const conv = {
      id: generateId(),
      title,
      messages: [],
      files: [],
      createdAt: Date.now(),
    };
    conversations.unshift(conv);
    activeId = conv.id;
    saveToStorage();
    return conv;
  }

  function setActive(id) {
    activeId = id;
  }

  function updateTitleFromFirstMessage(conv, text) {
    if (conv.messages.length === 1 && conv.title === "New Chat") {
      const clean = text.replace(/\s+/g, " ").trim().slice(0, 42);
      conv.title = clean || "New Chat";
    }
  }

  // ---------- Rendering ----------
  function renderConversationList() {
    const list = UI.getElements().conversationList;
    if (!list) return;

    list.innerHTML = "";

    if (conversations.length === 0) {
      list.innerHTML = `<div class="conv-empty">No conversations yet</div>`;
      return;
    }

    conversations.forEach((conv) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "conv-item" + (conv.id === activeId ? " active" : "");
      item.dataset.id = conv.id;
      item.innerHTML = `
        <svg class="conv-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <span class="conv-title">${escapeHtml(conv.title)}</span>
      `;
      item.addEventListener("click", () => {
        switchConversation(conv.id);
        if (UI.isMobile()) UI.closeSidebar();
      });
      list.appendChild(item);
    });
  }

  function attachCopyHandlers(container) {
    container.querySelectorAll(".copy-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const code = decodeURIComponent(btn.dataset.code || "");
        try {
          await navigator.clipboard.writeText(code);
          const span = btn.querySelector("span");
          if (span) {
            const prev = span.textContent;
            span.textContent = "Copied!";
            setTimeout(() => {
              span.textContent = prev;
            }, 1500);
          }
        } catch {
          // Fallback for older browsers / non-HTTPS
          const ta = document.createElement("textarea");
          ta.value = code;
          ta.style.position = "fixed";
          ta.style.left = "-9999px";
          document.body.appendChild(ta);
          ta.select();
          try {
            document.execCommand("copy");
          } catch (_) {}
          document.body.removeChild(ta);
        }
      });
    });
  }


  function appendMessage(role, content, isLoading) {
    const container = UI.getElements().messagesContainer;
    if (!container) return null;
    UI.showEmptyState(false);
    const el = createMessageElement(role, content, !!isLoading);
    container.appendChild(el);
    attachCopyHandlers(el);
    UI.scrollToBottom(false);
    return el;
  }

  function renderMessages() {
    const container = UI.getElements().messagesContainer;
    if (!container) return;

    const conv = getActive();
    container.innerHTML = "";

    if (!conv || conv.messages.length === 0) {
      UI.showEmptyState(true);
      return;
    }

    UI.showEmptyState(false);
    conv.messages.forEach((msg) => {
      container.appendChild(createMessageElement(msg.role, msg.content));
    });

    attachCopyHandlers(container);
    UI.scrollToBottom(false);
  }

  function switchConversation(id) {
    if (isProcessing) return; // prevent switch mid-request
    setActive(id);
    saveToStorage();
    renderConversationList();
    renderMessages();
  }

  // ---------- Context-aware Mock AI ----------
  function extractFacts(messages) {
    const facts = { name: null };
    // Normalize ZWNJ (\u200c) and extra spaces for matching
    const norm = (s) => (s || "").replace(/\u200c/g, "").replace(/\s+/g, " ").trim();

    messages.forEach((m) => {
      if (m.role !== "user") return;
      const c = norm(m.content || "");
      // Skip pure name-questions without a stated name
      if (/اسم(?:م| من)?\s*(چیست|چیه|چی بود|چی هست)|what.?s my name|what is my name/i.test(c) &&
          !/اسم(?:م| من)\s+[\u0600-\u06FFa-zA-Z]{2,}/.test(c)) {
        return;
      }
      let name = null;

      // 1) اسم من X است / اسمم X / اسم من X
      let mFa = c.match(/اسم(?:م| من)\s+([\u0600-\u06FFa-zA-Z][\u0600-\u06FFa-zA-Z\s\u200c]{0,35}?)(?:\s+(?:است|هست|هستم|میباشد|میباشم|می‌باشد|می‌باشم))?(?:[\s،.؟!]|$)/);
      if (mFa) name = mFa[1].trim();

      // 2) من X هستم
      if (!name) {
        let mSelf = c.match(/من\s+([\u0600-\u06FFa-zA-Z][\u0600-\u06FFa-zA-Z\s\u200c]{1,30}?)\s+(?:هستم|هست|است)/);
        if (mSelf) name = mSelf[1].trim();
      }

      // 3) English
      if (!name) {
        let mEn = c.match(/my\s+name\s+is\s+([A-Za-z\u0600-\u06FF][A-Za-z\u0600-\u06FF\s]{0,30}?)(?:[.!,?]|$)/i);
        if (mEn) name = mEn[1].trim();
      }

      // 4) اسمم = X  |  اسم من: X
      if (!name) {
        let mEq = c.match(/اسم(?:م| من)\s*[=:]\s*([\u0600-\u06FFa-zA-Z][\u0600-\u06FFa-zA-Z\s\u200c]{0,25})/);
        if (mEq) name = mEq[1].trim();
      }

      // 5) «من X ام» colloquial
      if (!name) {
        let mAm = c.match(/من\s+([\u0600-\u06FFa-zA-Z][\u0600-\u06FFa-zA-Z\s]{1,20}?)\s*ام(?:[\s.،]|$)/);
        if (mAm) name = mAm[1].trim();
      }

      if (name) {
        name = name.replace(/[؟!.,؛:]+$/g, "").replace(/\u200c/g, "").trim();
        if (/[اوی]ست$/.test(name) && name.length >= 4) name = name.slice(0, -2);
        else if (/است$/.test(name) && name.length >= 5) name = name.slice(0, -3);
        else if (/هستم$/.test(name) && name.length >= 6) name = name.slice(0, -4);
        else if (/هست$/.test(name) && name.length >= 5) name = name.slice(0, -3);
        name = name.replace(/\s+/g, " ").trim();
      }

      if (name && name.length >= 2 && !/^(من|چیست|چیه|is|what|اسم|نام|هستم)$/i.test(name)) {
        facts.name = name;
      }
    });
    return facts;
  }

  function buildContextSummary(messages) {
    const prior = messages.slice(0, -1);
    if (prior.length === 0) return null;

    const topics = [];
    let lastCode = null;
    let lastError = null;
    let lastCodeLang = null;

    prior.forEach((m) => {
      const raw = m.content || "";
      const t = raw.toLowerCase();
      // Persian + English topic signals
      if (t.includes("python") || t.includes("پایتون") || t.includes("پایتن")) topics.push("Python");
      if (t.includes("javascript") || t.includes("جاوااسکریپت") || t.includes("جاوا اسکریپت") || /\bjs\b|\bnode\b/.test(t)) topics.push("JavaScript");
      if (t.includes("typescript") || t.includes("تایپ‌اسکریپت") || t.includes("تایپ اسکریپت")) topics.push("TypeScript");
      if (t.includes("react") || t.includes("ری‌اکت") || t.includes("ری اکت")) topics.push("React");
      if (t.includes("vue") || t.includes("ویو")) topics.push("Vue");
      if (t.includes("django") || t.includes("جنگو")) topics.push("Django");
      if (t.includes("fastapi") || t.includes("fast api") || t.includes("فست‌ای‌پی‌آی")) topics.push("FastAPI");
      if (/bug|error|exception|traceback|خطا|اشکال|باگ|کار\s*نمی/.test(t)) topics.push("debugging");
      if (/refactor|تمیز|بهبود|بهینه|بازنویسی/.test(t)) topics.push("refactoring");
      if (t.includes("decorator") || t.includes("دکوریتور")) topics.push("decorators");
      if (/null|none|undefined|نال/.test(t)) topics.push("null-safety");
      if (/\basync\b|\bawait\b|\bpromise\b|آسنک|پرامیس/.test(t)) topics.push("async");
      if (/\bapi\b|endpoint|pydantic|اندپوینت/.test(t)) topics.push("API design");
      if (/test|تست|یونیت/.test(t)) topics.push("testing");
      if (/```|def |function |class |const |let |var /.test(raw)) topics.push("code-review");

      // Extract last fenced code block
      const codeMatch = raw.match(/```([\w]*)\n([\s\S]*?)```/);
      if (codeMatch && codeMatch[2] && codeMatch[2].trim().length > 8) {
        lastCode = codeMatch[2].trim();
        lastCodeLang = codeMatch[1] || "";
      }
      // Extract error / traceback snippets
      if (/traceback|exception|error|TypeError|ValueError|خطا|استثنا/i.test(raw)) {
        const errLine = raw.split("\n").find((l) => /error|exception|traceback|TypeError|ValueError|خطا/i.test(l));
        if (errLine) lastError = errLine.trim().slice(0, 200);
      }
    });

    // Also check files attached in conversation for code
    // (files live on conv, not messages — handled by caller if needed)

    const unique = [...new Set(topics)];
    const facts = extractFacts(prior);
    const lastUserMsg = prior.filter((m) => m.role === "user").slice(-1)[0];
    const lastAsstMsg = prior.filter((m) => m.role === "assistant").slice(-1)[0];
    return {
      messageCount: prior.length,
      topics: unique,
      facts,
      lastUser: (lastUserMsg && lastUserMsg.content) || "",
      lastAssistant: (lastAsstMsg && lastAsstMsg.content) || "",
      lastIntent: (lastUserMsg && lastUserMsg.meta && lastUserMsg.meta.intent) || null,
      lastCode,
      lastCodeLang,
      lastError,
    };
  }

  function detectIntent(text) {
    const t = text.toLowerCase().trim();
    const raw = (text || "").trim();
    const norm = raw.replace(/\u200c/g, " ").replace(/\s+/g, " ");

    // Name recall
    if (/اسم(?:م|\s*من)?\s*(چیست|چیه|چی\s*بود|چی\s*هست)|what\s*('?s| is)\s*my\s*name/i.test(norm)) {
      return "ask-name";
    }
    // User states name
    if (/اسم(?:م|\s*من)\s+[\u0600-\u06FFa-zA-Z].{0,40}(است|هست|هستم|می‌باشد)?|من\s+[\u0600-\u06FFa-zA-Z].{1,30}\s+هستم|my\s+name\s+is/i.test(norm)) {
      return "tell-name";
    }
    // Topic switch
    if (/نه\s*صبر|صبر\s*کن|بگذریم|موضوع\s*رو\s*عوض|موضوع\s*را\s*عوض|در\s*مورد\s+.+\s*بگو|about\s+\w+\s+instead|switch\s+to/i.test(norm)) {
      return "topic-switch";
    }
    // AI intro
    if (/خودت\s*را\s*معرفی|introduce\s+yourself|کی\s*هستی|who\s+are\s+you|چیستی|تو\s*کی\s*هستی/i.test(norm)) {
      return "intro";
    }

    // Short Persian follow-ups that inherit previous intent (handled later with context)
    // Detect action words that imply continuity
    const isShortFollow =
      /^(بیشتر|ادامه|ادامه\s*بده|بیشتر\s*بگو|مثال|مثال\s*بزن|کدش|کدشو|درستش\s*کن|درست\s*کن|رفعش\s*کن|توضیح\s*بده|باز\s*کن|نشان\s*بده|بده|کن)[\s!.،]*$/i.test(norm) ||
      /^(more|continue|fix\s*it|explain\s*more|show\s*(me|code)|give\s*(me|code))[\s!.]*$/i.test(norm);

    if (isShortFollow) return "follow-up";

    // Anaphora + code reference → prefer review/debug based on verbs
    const hasAnaphora = /\b(این|همین|اون|آن|قبلی|کدش|کدشو|خطاش|مشکلش|this|that|it|previous)\b/i.test(norm);
    const wantsFix = /درست\s*کن|رفع\s*کن|فیکس|fix|solve|repair/i.test(norm);
    const wantsReview = /بررسی|تحلیل|ببین|نگاه|review|check|look/i.test(norm);

    if (/```|def |function |class |const |let |var |import /.test(raw)) {
      if (wantsFix || /باگ|خطا|error|bug/i.test(norm)) return "debug";
      return "code-review";
    }
    if (hasAnaphora && wantsFix) return "debug";
    if (hasAnaphora && wantsReview) return "code-review";
    if (/این\s*کد|همین\s*کد|this\s+code|همین\s*رو|اینو\s*ببین/i.test(norm)) {
      return wantsFix ? "debug" : "code-review";
    }

    if (/\b(bug|error|exception|traceback|crash)\b|خطا|اشکال|باگ|کار\s*نمی\s*کنه|کار\s*نمیکنه|درست\s*کار\s*نمیکنه/i.test(norm)) {
      return "debug";
    }
    if (/refactor|تمیز|بهتر\s*بنویس|improve|clean\s*up|بهینه|بازنویسی/i.test(norm)) {
      return "refactor";
    }
    if (/decorator|دکوریتور/i.test(norm)) return "decorator";
    if (/یاد|learn|شروع|example|مثال|چطور|how\s+(to|does)|چیست|چیه|توضیح/i.test(norm)) {
      return "explain";
    }
    if (/^(سلام|درود|hi|hello|hey)[\s!.،,]*$/i.test(norm) || t === "hi" || t === "hello") return "greeting";
    return "general";
  }

  /** Resolve Persian/English pronouns to previous code or error from context */
  function resolveAnaphora(userText, ctx) {
    if (!ctx) return { kind: null, snippet: null, lang: null };
    const t = (userText || "").replace(/\u200c/g, " ");
    const pointsToCode = /این\s*کد|همین\s*کد|کدش|کدشو|همین\s*رو|اینو|this\s+code|the\s+code|previous\s+code|کد\s*قبلی/i.test(t);
    const pointsToError = /این\s*خطا|همین\s*خطا|خطاش|اون\s*ارور|this\s+error|the\s+error|stack/i.test(t);
    const pointsToPrev = /قبلی|همین|این|اون|آن|it|that|this/i.test(t);

    if ((pointsToCode || pointsToPrev) && ctx.lastCode) {
      return { kind: "code", snippet: ctx.lastCode, lang: ctx.lastCodeLang || "" };
    }
    if ((pointsToError || pointsToPrev) && ctx.lastError) {
      return { kind: "error", snippet: ctx.lastError, lang: null };
    }
    if (ctx.lastCode && /کد|code|باگ|خطا|بررسی|درست/i.test(t)) {
      return { kind: "code", snippet: ctx.lastCode, lang: ctx.lastCodeLang || "" };
    }
    return { kind: null, snippet: null, lang: null };
  }

  function detectNewTopic(text) {
    const t = text.toLowerCase();
    if (t.includes("react")) return "React";
    if (t.includes("python") || t.includes("پایتون")) return "Python";
    if (t.includes("javascript") || t.includes("js")) return "JavaScript";
    if (t.includes("django")) return "Django";
    if (t.includes("fastapi")) return "FastAPI";
    if (t.includes("vue")) return "Vue";
    if (t.includes("angular")) return "Angular";
    return null;
  }

  /**
   * Context-aware mock response generator.
   * Uses the full conversation history of the ACTIVE conversation only.
   */
  function generateContextualReply(userText, history) {
    const ctx = buildContextSummary(history);
    // Local detect first (handles Persian name memory + topic-switch)
    let intent = detectIntent(userText);
    const localIntent = intent;

    // Smart Intent (from intent.js) – but NEVER overwrite critical Persian name intents
    if (window.Intent) {
      const smart = Intent.detect(userText, { messages: history, files: (getActive() && getActive().files) || [] });
      if (smart && smart.intent) {
        const protectedIntents = ["tell-name", "ask-name", "topic-switch", "intro", "follow-up"];
        if (!protectedIntents.includes(localIntent)) {
          intent = smart.intent;
        }
        // If local said general but smart is more specific → take smart
        if (localIntent === "general" && smart.intent !== "general" && smart.confidence >= 0.65) {
          intent = smart.intent;
        }
      }
    }
    // Pure general chat: do not force coding topics
    if (intent === "general" && !(ctx && ctx.topics && ctx.topics.length)) {
      return "متوجه شدم.\n\nاگر سؤال غیرفنی است همین‌جا جواب می‌دهم؛ اگر کد یا خطایی داری paste کن تا دقیق‌تر کمک کنم.\n\n" +
        "پیام تو: «" + userText.slice(0, 200) + (userText.length > 200 ? "…" : "") + "»";
    }
    const hasContext = ctx && ctx.messageCount > 0;
    const topicHint = hasContext && ctx.topics.length
      ? ctx.topics.slice(0, 3).join(", ")
      : null;
    const facts = (ctx && ctx.facts) || extractFacts(history.slice(0, -1));
    // Also extract from full history including current if user just stated name
    const allFacts = extractFacts(history);

    // --- Offline knowledge layer (terminology + fine intent) ---
    let fineLabel = null;
    let termHits = [];
    if (window.Knowledge && Knowledge.isReady()) {
      const km = Knowledge.matchIntent(userText);
      if (km) {
        fineLabel = km.fine;
        termHits = km.terms || [];
        // Align coarse intent with dataset when stronger
        if (km.coarse && km.confidence >= 0.55) {
          const protectedLocal = ["tell-name", "ask-name", "topic-switch", "intro", "greeting"];
          if (!protectedLocal.includes(intent)) {
            intent = km.coarse;
          }
        }
      }
    }

    // --- Anaphora + short follow-up inheritance (Persian-aware) ---
    const ref = resolveAnaphora(userText, ctx);
    if (intent === "follow-up" && ctx && ctx.lastIntent) {
      // Inherit previous intent for short replies: «ادامه بده»، «درستش کن»، «مثال بزن»
      const inheritMap = {
        debug: "debug",
        "code-review": "code-review",
        refactor: "refactor",
        explain: "explain",
        "code-generation": "code-generation",
        decorator: "decorator",
      };
      if (inheritMap[ctx.lastIntent]) {
        intent = inheritMap[ctx.lastIntent];
      } else if (/درست|رفع|فیکس|fix/i.test(userText)) {
        intent = "debug";
      } else if (/مثال|کد|code|بده/i.test(userText)) {
        intent = ctx.lastIntent === "explain" ? "explain" : "code-generation";
      } else {
        intent = "explain";
      }
    }
    // If user points to previous code without pasting it again
    if (ref.kind === "code" && (intent === "general" || intent === "follow-up")) {
      intent = /درست|رفع|باگ|خطا|fix|error/i.test(userText) ? "debug" : "code-review";
    }

    // --- AI intro ---
    if (intent === "intro" || (intent === "greeting" && /معرفی|introduce|who are you|کی هستی/i.test(userText))) {
      return "سلام! من **Nova** هستم — دستیار کدنویسی شخصی تو.\n\nمی‌تونم:\n- کد رو بررسی و باگ‌یابی کنم\n- مفاهیم برنامه‌نویسی رو توضیح بدم\n- پیشنهاد refactor و پیاده‌سازی بهتر بدم\n\nContext همین Conversation رو حفظ می‌کنم. بگو از کجا شروع کنیم.";
    }

    // --- Greeting ---
    if (intent === "greeting") {
      if (hasContext && allFacts.name) {
        return `سلام دوباره ${allFacts.name}! 👋 روی چی کار کنیم؟`;
      }
      return hasContext
        ? `سلام دوباره! 👋 ${topicHint ? `هنوز می‌تونیم روی **${topicHint}** ادامه بدیم.` : "Context قبلی این چت رو دارم."} چه کمکی نیاز داری؟`
        : "سلام! من **Nova** هستم، دستیار کدنویسی تو.\n\nمی‌تونی کد بفرستی، باگ بپرسی، یا درخواست توضیح/refactor بدی.";
    }

    // --- User tells name ---
    if (intent === "tell-name") {
      const name = allFacts.name || extractFacts([{ role: "user", content: userText }]).name;
      if (name) {
        return `خوشبختم ${name}! 👋 اسمت رو یادم می‌مونه.\n\nمن **Nova** هستم. بگو در مورد چه کدی یا موضوعی کمک می‌خوای.`;
      }
      return "خوشبختم! بگو چطور می‌تونم در برنامه‌نویسی کمکت کنم.";
    }

    // --- Ask name ---
    if (intent === "ask-name") {
      if (allFacts.name) {
        return `اسم تو **${allFacts.name}** است — خودت در همین Conversation گفته بودی.`;
      }
      if (hasContext && ctx.lastUser && /اسم/.test(ctx.lastUser)) {
        return `بر اساس پیام قبلی‌ات («${ctx.lastUser.slice(0, 60)}»)، اسمت را همان‌جا گفته بودی. اگر درست متوجه نشدم، دوباره بگو.`;
      }
      return "هنوز اسمت را در این Conversation به من نگفته‌ای. اگر بگی یادم می‌ماند.";
    }

    // --- Explicit topic switch ---
    if (intent === "topic-switch") {
      const newTopic = detectNewTopic(userText);
      if (newTopic) {
        return `باشه، موضوع را به **${newTopic}** عوض می‌کنیم.\n\n${
          newTopic === "React"
            ? "React یک کتابخانه UI برای ساخت رابط کاربری component-based است. بگو می‌خوای از component، hooks، یا state management شروع کنیم؟"
            : newTopic === "Python"
            ? "از کجای Python شروع کنیم؟ سینتکس پایه، ساختار داده، یا یک مثال عملی؟"
            : `در مورد **${newTopic}** چه بخشی را می‌خوای بررسی کنیم؟`
        }`;
      }
      return "باشه، موضوع قبلی را کنار می‌گذاریم. موضوع جدید دقیقاً چیست؟";
    }

    // --- Fine-grained domain replies (from knowledge dataset labels) ---
    if (fineLabel === "security" || (fineLabel === "review" && /امنیت|security|xss|csrf|injection|sql/i.test(userText))) {
      let reply = "تحلیل **امنیتی** (بر اساس شواهد کد و اصطلاحات تشخیص‌داده‌شده):\n\n";
      if (termHits.length) reply += Knowledge.describeTerms(termHits) + "\n\n";
      reply += "1. ورودی‌ها validate / sanitize شده‌اند؟\n";
      reply += "2. secret یا token در frontend لو نرفته؟\n";
      reply += "3. خطر XSS / SQL injection / CSRF را چک کن.\n";
      reply += "4. authorization روی endpointها اجباری است؟\n\n";
      reply += "اگر تکه کد حساس را paste کنی، نقاط آسیب‌پذیر را دقیق‌تر می‌گویم.";
      return reply;
    }
    if (fineLabel === "performance") {
      let reply = "تحلیل **کارایی / performance**:\n\n";
      if (termHits.length) reply += Knowledge.describeTerms(termHits) + "\n\n";
      reply += "- bottleneck احتمالی (loop، query، render مکرر)\n";
      reply += "- مصرف حافظه و احتمال memory leak\n";
      reply += "- async بدون کنترل (waterfall درخواست‌ها)\n";
      reply += "- نیاز به caching یا pagination\n\n";
      reply += "کد یا پروفایل را بفرست تا نقطه داغ را مشخص کنم.";
      return reply;
    }
    if (fineLabel === "fix") {
      let reply = "حالت **اصلاح (fix)** — تغییر کم‌ریسک:\n\n";
      if (ref.kind === "code" && ref.snippet) {
        reply += "کد قبلی را مبنا قرار دادم.\n\n";
      }
      reply += "1. علت محتمل را از روی شواهد جدا کن\n";
      reply += "2. یک patch کوچک و قابل‌تست پیشنهاد بده\n";
      reply += "3. edge-case (null / empty / race) را پوشش بده\n\n";
      reply += "```python\n# الگوی دفاعی\nif data is None:\n    raise ValueError(\"missing data\")\n```\n\n";
      reply += "اگر stack trace داری بفرست تا fix دقیق‌تری بدهم.";
      return reply;
    }
    if (fineLabel === "explain_error") {
      let reply = "توضیح **خطا**:\n\n";
      if (ctx && ctx.lastError) reply += `آخرین نشانه خطا: «${ctx.lastError}»\n\n`;
      if (termHits.length) reply += Knowledge.describeTerms(termHits) + "\n\n";
      reply += "1. این پیام یعنی چه (به زبان ساده)\n";
      reply += "2. معمولاً از کجا می‌آید\n";
      reply += "3. چطور Reproduce و رفعش کنی\n\n";
      reply += "متن کامل error یا stack trace را بفرست.";
      return reply;
    }
    if (fineLabel === "explain_code") {
      let reply = "توضیح **منطق کد** مرحله‌به‌مرحله:\n\n";
      if (ref.kind === "code" && ref.snippet) {
        const preview = ref.snippet.slice(0, 220) + (ref.snippet.length > 220 ? "\n…" : "");
        reply += "```" + (ref.lang || "") + "\n" + preview + "\n```\n\n";
      }
      reply += "1. ورودی‌ها چیستند\n2. جریان اجرا\n3. خروجی / side-effect\n4. فرض‌های پنهان\n\n";
      reply += "اگر بخش خاصی مبهم است بگو تا همان را باز کنم.";
      return reply;
    }
    if (fineLabel === "refactor") {
      intent = "refactor";
    }
    if (fineLabel === "test") {
      let reply = "پیشنهاد **تست**:\n\n";
      reply += "- unit test برای منطق خالص\n";
      reply += "- edge case: null، لیست خالی، مقدار مرزی\n";
      reply += "- در صورت API: integration test مسیر اصلی\n";
      reply += "- regression برای باگ رفع‌شده\n\n";
      reply += "تابع یا ماژول را بفرست تا test caseهای مشخص بنویسم.";
      return reply;
    }
    if (fineLabel && ["api", "database", "ui", "git", "config", "network", "architecture"].includes(fineLabel)) {
      const titles = {
        api: "API / ارتباط client-server",
        database: "دیتابیس / query",
        ui: "UI / DOM / CSS",
        git: "Git / diff / merge",
        config: "config / build / dependency",
        network: "network / timeout / retry",
        architecture: "معماری / وابستگی ماژول‌ها",
      };
      let reply = `بازبینی متمرکز روی **${titles[fineLabel] || fineLabel}**:\n\n`;
      if (termHits.length) reply += Knowledge.describeTerms(termHits) + "\n\n";
      reply += "نکات را فقط بر اساس شواهد کد می‌گویم. تکه مرتبط را paste کن تا دقیق‌تر شویم.\n";
      return reply;
    }

    // --- Code review ---
    if (intent === "code-review") {
      let reply = "کدت رو بررسی کردم.\n\n";
      if (ref.kind === "code" && ref.snippet) {
        reply += "به **کد قبلی** که فرستاده بودی ارجاع دادی؛ همان را مبنا قرار دادم.\n\n";
        const preview = ref.snippet.slice(0, 280) + (ref.snippet.length > 280 ? "\n…" : "");
        reply += "```" + (ref.lang || "") + "\n" + preview + "\n```\n\n";
      } else if (hasContext && topicHint) {
        reply += `با توجه به صحبت قبلی‌مون درباره **${topicHint}**، چند نکته:\n\n`;
      } else {
        reply += "چند نکته مهم:\n\n";
      }
      reply += "1. ساختار کلی خوانا است.\n";
      reply += "2. بهتر است edge-caseها (مثل `null` / لیست خالی) را صریح handle کنی.\n";
      reply += "3. نام‌گذاری و type hint کیفیت کد را بالا می‌برد.\n\n";
      reply += "```python\n# مثال ایمن‌تر\ndef safe_get(items):\n    if not items:\n        return None\n    return items[0]\n```\n\n";
      reply += "اگر بخوای نسخه refactored کامل‌تر بدم، بگو.";
      return reply;
    }

    // --- Debug ---
    if (intent === "debug") {
      let reply = "";
      if (ref.kind === "code" && ref.snippet) {
        reply += "به **کد / خطای قبلی** ارجاع دادی؛ همان context را برای دیباگ استفاده کردم.\n\n";
        const preview = ref.snippet.slice(0, 240) + (ref.snippet.length > 240 ? "\n…" : "");
        reply += "```" + (ref.lang || "") + "\n" + preview + "\n```\n\n";
      } else if (ref.kind === "error" && ref.snippet) {
        reply += `خطای قبلی که دیدی: «${ref.snippet}»\n\n`;
      } else if (hasContext) {
        reply += "با توجه به پیام‌های قبلی این Conversation";
        if (topicHint) reply += ` (موضوع: **${topicHint}**)`;
        reply += "، احتمالاً مشکل از اینجا است:\n\n";
      } else {
        reply += "برای پیدا کردن باگ، این موارد را چک کن:\n\n";
      }
      if (ctx && ctx.lastError && ref.kind !== "error") {
        reply += `آخرین نشانه‌ی خطا در مکالمه: «${ctx.lastError}»\n\n`;
      }
      reply += "- ورودی‌های `None` / `undefined`\n";
      reply += "- index خارج از محدوده\n";
      reply += "- async بدون `await`\n";
      reply += "- state که قبل از render آپدیت نشده\n\n";
      reply += "```python\n# الگوی دفاعی\nvalue = data.get(\"key\") if data else None\nif value is None:\n    raise ValueError(\"Missing key\")\n```\n\n";
      reply += "اگر stack trace یا تکه کد دقیق‌تری بفرستی، دقیق‌تر می‌گم کجا می‌شکنه.";
      return reply;
    }

    // --- Refactor ---
    if (intent === "refactor") {
      let reply = "برای تمیزتر شدن کد:\n\n";
      if (hasContext && topicHint) {
        reply += `چون قبلاً درباره **${topicHint}** حرف زدیم، پیشنهادها را در همان راستا می‌دهم:\n\n`;
      }
      reply += "- توابع را کوچک و تک‌مسئولیتی نگه دار\n";
      reply += "- تکرار را به helper منتقل کن\n";
      reply += "- نام‌های واضح به‌جای abbreviation\n";
      reply += "- early return به‌جای nest عمیق\n\n";
      reply += "```javascript\n// قبل: تو در تو\nif (user) {\n  if (user.active) {\n    doWork(user);\n  }\n}\n\n// بعد: early return\nif (!user || !user.active) return;\ndoWork(user);\n```\n\n";
      reply += "کد فعلی‌ات را بفرست تا نسخه بازنویسی‌شده بدهم.";
      return reply;
    }

    // --- Decorator ---
    if (intent === "decorator") {
      return "یک مثال ساده از **decorator** در Python:\n\n```python\ndef log_calls(fn):\n    def wrapper(*args, **kwargs):\n        print(f\"Calling {fn.__name__}\")\n        return fn(*args, **kwargs)\n    return wrapper\n\n@log_calls\ndef add(a, b):\n    return a + b\n\nprint(add(2, 3))  # Calling add → 5\n```\n\ndecorator تابع را می‌گیرد، یک تابع جدید برمی‌گرداند و رفتار اضافه می‌کند بدون تغییر خود تابع اصلی.\n\nاگر بخوای نسخه با `functools.wraps` یا class-based هم بگم.";
    }

    // --- Explain ---
    if (intent === "explain") {
      let reply = "";
      if (hasContext && topicHint) {
        reply += `ادامه همان مسیر **${topicHint}**:\n\n`;
      } else {
        reply += "بگذار مرحله‌به‌مرحله توضیح بدهم:\n\n";
      }
      // If asking what X is
      if (/python چیست|پایتون چیست|what is python/i.test(userText)) {
        reply = "**Python** یک زبان برنامه‌نویسی سطح‌بالا و همه‌منظوره است.\n\nویژگی‌ها:\n- سینتکس ساده و خوانا\n- مناسب web، data، AI، automation\n- اکوسیستم کتابخانه‌ای قوی\n\nاگر بخوای، کاربردها یا یک مثال کوچک هم می‌گم.";
        return reply;
      }
      if (/کاربرد|application|use case|استفاده/i.test(userText) && hasContext && topicHint) {
        return `کاربردهای **${topicHint}** شامل موارد زیر است:\n\n- توسعه وب (Django، FastAPI، Flask)\n- داده و یادگیری ماشین\n- اسکریپت و automation\n- ابزارهای CLI\n\nکدام حوزه را عمیق‌تر می‌خوای؟`;
      }
      reply += "1. مفهوم را ساده تعریف کن\n";
      reply += "2. یک مثال خیلی کوچک بنویس\n";
      reply += "3. یک edge-case نشان بده\n";
      reply += "4. تمرین کوتاه برای خودت بساز\n\n";
      reply += "موضوع دقیق‌تری بگو تا مثال عملی بزنم.";
      return reply;
    }

    // --- Follow-up with context ---
    if (hasContext) {
      const lastUserShort = (ctx.lastUser || "").slice(0, 80);
      let reply = "پیامت را در ادامه مکالمه فعلی فهمیدم";
      if (topicHint) reply += ` (موضوع‌های باز: **${topicHint}**)`;
      if (allFacts.name) reply += ` — ${allFacts.name}`;
      reply += ".\n\n";

      if (lastUserShort) {
        reply += `قبلاً گفته بودی: «${lastUserShort}${ctx.lastUser.length > 80 ? "…" : ""}»\n\n`;
      }

      reply += "بر اساس همان Context:\n";
      reply += "- اگر می‌خوای عمیق‌تر برویم، جزئیات بیشتری از همان موضوع بفرست.\n";
      reply += "- اگر موضوع عوض شده، مستقیم بگو تا روی موضوع جدید تمرکز کنم.\n";
      reply += "- اگر کد یا error داری، paste کن تا دقیق تحلیل کنم.\n\n";
      reply += "من **Nova** هستم و Context همین Conversation را نگه می‌دارم.";
      return reply;
    }

    // --- First message general ---
    return "پیامت را دریافت کردم.\n\nبرای کمک بهتر می‌توانی:\n- یک **تکه کد** بفرستی\n- بگی **چه خطایی** می‌گیری\n- یا بپرسی **چطور بهتر بنویسم**\n\nمن **Nova** هستم و Context همین چت را تا آخر نگه می‌دارم. هر سوالی داری بپرس.";
  }

  function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  let activeAbort = null;

  function historyForApi(conv) {
    return (conv.messages || [])
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content }));
  }

  /**
   * Call Nova LLM Gateway with optional SSE streaming.
   * Returns full assistant text. Throws Error with user-safe message.
   */
  async function callLlmGateway(conv, onToken) {
    const base = (AppConfig.api.baseUrl || "").replace(/\/$/, "");
    const url = base + (AppConfig.api.chatEndpoint || "/api/chat");
    const controller = new AbortController();
    activeAbort = controller;

    const body = {
      messages: historyForApi(conv),
      stream: true,
      files: (conv.files || []).slice(-3).map((f) => ({
        path: f.name,
        content: (f.content || "").slice(0, 80000),
        language: f.language || "",
      })),
      intent: (window.Intent
        ? Intent.detect(
            (conv.messages.filter((m) => m.role === "user").slice(-1)[0] || {}).content || "",
            { messages: conv.messages, files: conv.files || [] }
          )
        : null),
    };

    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      activeAbort = null;
      if (err.name === "AbortError") throw new Error("Generation stopped.");
      throw new Error("Cannot reach Nova gateway. Is the server running on " + base + "?");
    }

    if (!response.ok) {
      activeAbort = null;
      let detail = "LLM request failed (" + response.status + ").";
      try {
        const data = await response.json();
        if (data && data.detail) detail = String(data.detail);
      } catch (_) {}
      if (response.status === 503) {
        detail = "LLM is not configured. Set AI_API_KEY in the server .env file.";
      }
      throw new Error(detail);
    }

    const contentType = response.headers.get("content-type") || "";
    // Non-streaming JSON fallback
    if (!contentType.includes("text/event-stream")) {
      activeAbort = null;
      const data = await response.json();
      return (data && data.content) || "";
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          const raw = line.slice(5).trim();
          if (!raw) continue;
          let evt;
          try {
            evt = JSON.parse(raw);
          } catch (_) {
            continue;
          }
          if (evt.type === "token" && evt.content) {
            full += evt.content;
            if (typeof onToken === "function") onToken(evt.content, full);
          } else if (evt.type === "error") {
            throw new Error(evt.message || "LLM stream error");
          } else if (evt.type === "done") {
            // finished
          }
        }
      }
    } finally {
      activeAbort = null;
    }

    return full;
  }

  function stopGeneration() {
    if (activeAbort) {
      activeAbort.abort();
      activeAbort = null;
    }
  }

  // ---------- Public actions ----------
  async function sendMessage(text) {
    text = (text || "").trim();
    const pendingFile = window.Upload ? Upload.getPending() : null;
    if ((!text && !pendingFile) || isProcessing) return;

    if (text.length > AppConfig.ui.maxMessageLength) {
      text = text.slice(0, AppConfig.ui.maxMessageLength);
    }

    let conv = getActive();
    if (!conv) {
      conv = createConversation();
    }
    if (!conv.files) conv.files = [];

    const convIdAtSend = conv.id;

    // Attach pending file to conversation
    if (pendingFile) {
      conv.files.push(pendingFile);
      if (!text) {
        text = "Please analyze this file: " + pendingFile.name;
      }
      if (window.Upload) Upload.clearPending();
      if (typeof UI !== "undefined" && UI.renderAttachPreview) UI.renderAttachPreview(null);
    }

    // Ensure offline knowledge dataset is available (non-blocking if already loading)
    if (window.Knowledge && !Knowledge.isReady()) {
      try { await Knowledge.load(); } catch (_) {}
    }

    const intentInfo = window.Intent
      ? Intent.detect(text, { messages: conv.messages, files: conv.files })
      : { intent: "general", confidence: 0.5 };

    // Prefer dataset fine-label when confidence is solid
    let fineIntent = intentInfo.fine || null;
    if (window.Knowledge && Knowledge.isReady()) {
      const km = Knowledge.matchIntent(text);
      if (km && km.fine && km.confidence >= 0.5) {
        fineIntent = km.fine;
        if (km.coarse && km.confidence >= (intentInfo.confidence || 0)) {
          intentInfo.intent = km.coarse;
          intentInfo.confidence = Math.max(intentInfo.confidence || 0, km.confidence);
        }
      }
    }

    conv.messages.push({
      role: "user",
      content: text,
      ts: Date.now(),
      meta: {
        intent: intentInfo.intent,
        fine: fineIntent,
        confidence: intentInfo.confidence,
        hasFile: !!pendingFile,
        fileName: pendingFile ? pendingFile.name : undefined,
      },
    });
    updateTitleFromFirstMessage(conv, text);
    renderConversationList();

    // Incremental UI: first message needs full layout switch; later only append
    if (conv.messages.length <= 1) {
      renderMessages();
    } else {
      appendMessage("user", text, false);
    }

    isProcessing = true;
    UI.setComposerDisabled(true);

    const container = UI.getElements().messagesContainer;
    const loadingEl = createMessageElement("assistant", "", true);
    loadingEl.id = "loading-msg";
    if (container) {
      container.appendChild(loadingEl);
      UI.scrollToBottom();
    }

    const targetConv = () => conversations.find((c) => c.id === convIdAtSend) || conv;

    let reply = "";
    let usedMock = false;

    try {
      const rt = window.NovaRuntime || {};
      const preferMock = AppConfig.useMockAI || rt.forceMock || (!rt.gatewayOnline && AppConfig.mockFallbackOnOffline);

      if (preferMock) {
        usedMock = true;
        const wait =
          AppConfig.ui.typingDelayMin +
          Math.random() * (AppConfig.ui.typingDelayMax - AppConfig.ui.typingDelayMin);
        await delay(wait);
        const tc = targetConv();
        // Reuse intent computed at send time (stored on last user message meta)
        const lastUser = tc.messages.filter((m) => m.role === "user").slice(-1)[0];
        const intentNow = (lastUser && lastUser.meta && lastUser.meta.intent)
          ? { intent: lastUser.meta.intent }
          : (window.Intent
            ? Intent.detect(text, { messages: tc.messages, files: tc.files || [] })
            : { intent: "general" });

        if (intentNow.intent === "debug" && window.Debugger) {
          const lastFile = (tc.files && tc.files.length) ? tc.files[tc.files.length - 1] : null;
          const codeFromMsg = (text.match(/```[\w]*\n([\s\S]*?)```/) || [])[1] || null;
          const stackMatch = text.match(/((?:Traceback[\s\S]+)|(?:\s+at\s+.+:\d+[\s\S]*))/);
          const langFromFile = lastFile && lastFile.language ? lastFile.language : null;
          const langFromFence = (text.match(/```(\w+)/) || [])[1] || null;
          const dbgInput = {
            sourceCode: codeFromMsg || (lastFile && lastFile.content) || null,
            language: langFromFence || langFromFile || null,
            files: tc.files || [],
            errorMessage: text,
            stackTrace: stackMatch ? stackMatch[0] : null,
            userDescription: text,
            expectedBehavior: null,
            actualBehavior: null,
          };
          let session;
          if (Debugger.runSmart) {
            session = await Debugger.runSmart(dbgInput);
          } else {
            session = Debugger.run(dbgInput);
          }
          reply = (session && session._report) ? session._report : Debugger.formatReport(session);
          if (session && session.related_memories && session.related_memories.length) {
            reply += "\n\n🧠 Similar previous experience found";
          }
          if (session && session.learning && session.learning.stored) {
            reply += "\n\n🧠 Experience saved";
          }
        } else if (
          (intentNow.intent === "file-analysis" || intentNow.intent === "code-review") &&
          tc.files && tc.files.length && window.Analysis
        ) {
          const f = tc.files[tc.files.length - 1];
          const report = Analysis.analyzeSync ? Analysis.analyzeSync(f) : Analysis.analyze(f);
          // analyze may return a Promise if only async path exists
          const resolved = (report && typeof report.then === "function") ? await report : report;
          reply = Analysis.formatReport(f, resolved);
        } else if (intentNow.intent === "general" || intentNow.intent === "greeting" || intentNow.intent === "intro") {
          reply = generateContextualReply(text, tc.messages);
        } else {
          reply = generateContextualReply(text, tc.messages);
        }
        if (!rt.gatewayOnline && !AppConfig.useMockAI) {
          reply = "_(Gateway offline — local mock)_\n\n" + reply;
        }
      } else {
        // Gateway online: still route Debug intents through Debug Intelligence
        const tc = targetConv();
        const lastUser = tc.messages.filter((m) => m.role === "user").slice(-1)[0];
        const intentNow = (lastUser && lastUser.meta && lastUser.meta.intent)
          ? { intent: lastUser.meta.intent }
          : (window.Intent
            ? Intent.detect(text, { messages: tc.messages, files: tc.files || [] })
            : { intent: "general" });

        if (intentNow.intent === "debug" && window.Debugger) {
          const lastFile = (tc.files && tc.files.length) ? tc.files[tc.files.length - 1] : null;
          const codeFromMsg = (text.match(/```[\w]*\n([\s\S]*?)```/) || [])[1] || null;
          const stackMatch = text.match(/((?:Traceback[\s\S]+)|(?:\s+at\s+.+:\d+[\s\S]*))/);
          const langFromFile = lastFile && lastFile.language ? lastFile.language : null;
          const langFromFence = (text.match(/```(\w+)/) || [])[1] || null;
          const dbgInput = {
            sourceCode: codeFromMsg || (lastFile && lastFile.content) || null,
            language: langFromFence || langFromFile || null,
            files: tc.files || [],
            errorMessage: text,
            stackTrace: stackMatch ? stackMatch[0] : null,
            userDescription: text,
            expectedBehavior: null,
            actualBehavior: null,
          };
          let session;
          try {
            if (Debugger.runSmart) {
              session = await Debugger.runSmart(dbgInput);
            } else {
              session = Debugger.run(dbgInput);
            }
          } catch (dbgErr) {
            session = null;
          }
          // Prefer backend report; optionally enrich via LLM with debug context
          const report = (session && session._report) ? session._report : (session ? Debugger.formatReport(session) : null);
          const learningNote = (session && session.learning)
            ? (session.learning.stored ? "\n\n🧠 Experience saved" : "")
            : "";
          const memNote = (session && session.related_memories && session.related_memories.length)
            ? "\n\n🧠 Similar previous experience found"
            : ((session && session._llmContext && /memory|experience/i.test(session._llmContext))
              ? "\n\n🧠 Similar previous experience found" : "");
          if (report) {
            // If LLM is available, ask it to reason over the structured debug context
            try {
              const dbgCtx = (session && session._llmContext) ? session._llmContext : report;
              const enrichedConv = {
                messages: [
                  { role: "system", content: "You are Nova Debug Reasoning Layer. Use ONLY the provided evidence and structured debug analysis. Do not invent runtime results or evidence. Explain root cause, rank hypotheses, and propose a concrete fix. Distinguish Current Evidence vs Previous Experience." },
                  { role: "user", content: "User request:\n" + text + "\n\n--- Debug Intelligence Context ---\n" + dbgCtx },
                ],
                files: tc.files || [],
              };
              let streamBody = null;
              reply = await callLlmGateway(enrichedConv, (token, full) => {
                const loading = document.getElementById("loading-msg");
                if (loading && activeId === convIdAtSend) {
                  if (!streamBody) {
                    loading.className = "message message-assistant";
                    loading.innerHTML = "";
                    const av = document.createElement("div");
                    av.className = "message-avatar";
                    av.textContent = "N";
                    streamBody = document.createElement("div");
                    streamBody.className = "message-body";
                    loading.appendChild(av);
                    loading.appendChild(streamBody);
                  }
                  streamBody.innerHTML = renderContent(full);
                  UI.scrollToBottom(false);
                }
              });
              if (reply) {
                reply = reply + memNote + learningNote;
              } else {
                reply = report + memNote + learningNote;
              }
            } catch (_) {
              reply = report + memNote + learningNote;
            }
          } else {
            // fallback pure LLM
            let streamBody = null;
            reply = await callLlmGateway(targetConv(), (token, full) => {
              const loading = document.getElementById("loading-msg");
              if (loading && activeId === convIdAtSend) {
                if (!streamBody) {
                  loading.className = "message message-assistant";
                  loading.innerHTML = "";
                  const av = document.createElement("div");
                  av.className = "message-avatar";
                  av.textContent = "N";
                  streamBody = document.createElement("div");
                  streamBody.className = "message-body";
                  loading.appendChild(av);
                  loading.appendChild(streamBody);
                }
                streamBody.innerHTML = renderContent(full);
                UI.scrollToBottom(false);
              }
            });
          }
        } else {
          let streamBody = null;
          reply = await callLlmGateway(targetConv(), (token, full) => {
            const loading = document.getElementById("loading-msg");
            if (loading && activeId === convIdAtSend) {
              if (!streamBody) {
                loading.className = "message message-assistant";
                loading.innerHTML = "";
                const av = document.createElement("div");
                av.className = "message-avatar";
                av.textContent = "N";
                streamBody = document.createElement("div");
                streamBody.className = "message-body";
                loading.appendChild(av);
                loading.appendChild(streamBody);
              }
              streamBody.innerHTML = renderContent(full);
              UI.scrollToBottom(false);
            }
          });
        }
        if (!reply) {
          throw new Error("Empty response from LLM.");
        }
      }
    } catch (err) {
      const msg = (err && err.message) || "Unknown error";
      const offline = /Cannot reach Nova gateway|Failed to fetch|NetworkError/i.test(msg);
      if (offline && AppConfig.mockFallbackOnOffline) {
        if (window.NovaRuntime) window.NovaRuntime.gatewayOnline = false;
        usedMock = true;
        reply = "_(Gateway offline — local mock)_\n\n" +
          generateContextualReply(text, targetConv().messages);
        if (typeof UI !== "undefined") UI.setStatus(false, "Gateway offline · Mock");
      } else {
        reply = "⚠️ " + msg;
      }
    }

    const loading = document.getElementById("loading-msg");
    if (loading) loading.remove();

    const tc = targetConv();
    tc.messages.push({
      role: "assistant",
      content: reply,
      ts: Date.now(),
      meta: usedMock ? { source: "mock" } : { source: "llm" },
    });
    saveToStorage();

    if (activeId === convIdAtSend) {
      // Incremental update: drop loading + append assistant (avoid full list rebuild)
      const loading = document.getElementById("loading-msg");
      if (loading) loading.remove();
      appendMessage("assistant", reply, false);
      renderConversationList();
    } else {
      renderConversationList();
    }

    isProcessing = false;
    UI.setComposerDisabled(false);

    const input = UI.getElements().messageInput;
    if (input) {
      input.value = "";
      UI.autoResizeTextarea();
      input.focus();
    }
  }

  function newChat() {
    if (isProcessing) return;
    createConversation();
    renderConversationList();
    renderMessages();
    const input = UI.getElements().messageInput;
    if (input) {
      input.value = "";
      UI.autoResizeTextarea();
      input.focus();
    }
  }

  function init() {
    const restored = loadFromStorage();
    if (!restored && conversations.length === 0) {
      createConversation();
    }
    // Ensure activeId is valid
    if (activeId && !conversations.find((c) => c.id === activeId)) {
      activeId = conversations[0] ? conversations[0].id : null;
    }
    if (!activeId && conversations.length > 0) {
      activeId = conversations[0].id;
    }
    renderConversationList();
    renderMessages();
  }

  return {
    init,
    sendMessage,
    newChat,
    switchConversation,
    getActive,
    stopGeneration,
  };
})();
