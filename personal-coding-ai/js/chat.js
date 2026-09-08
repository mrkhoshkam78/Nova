/**
 * chat.js – Conversation state + message rendering + Context-aware Mock AI
 */

const Chat = window.Chat = (() => {
  let conversations = [];
  let activeId = null;
  let isProcessing = false;

  // ---------- Helpers ----------
  function generateId() {
    return "c_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
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
      createdAt: Date.now(),
    };
    conversations.unshift(conv);
    activeId = conv.id;
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
    renderConversationList();
    renderMessages();
  }

  // ---------- Context-aware Mock AI ----------
  /**
   * Builds a simple context summary from previous messages in THIS conversation.
   * Used so the mock reply can reference prior topics instead of answering randomly.
   */
  function buildContextSummary(messages) {
    // Exclude the last message (current user message already known)
    const prior = messages.slice(0, -1);
    if (prior.length === 0) return null;

    const topics = [];
    prior.forEach((m) => {
      const t = (m.content || "").toLowerCase();
      if (t.includes("python") || t.includes("پایتون")) topics.push("Python");
      if (t.includes("javascript") || t.includes("js ") || t.includes("node")) topics.push("JavaScript");
      if (t.includes("react")) topics.push("React");
      if (t.includes("bug") || t.includes("error") || t.includes("خطا") || t.includes("اشکال")) topics.push("debugging");
      if (t.includes("refactor") || t.includes("تمیز") || t.includes("بهبود")) topics.push("refactoring");
      if (t.includes("decorator")) topics.push("decorators");
      if (t.includes("null") || t.includes("none")) topics.push("null-safety");
      if (t.includes("async") || t.includes("await") || t.includes("promise")) topics.push("async");
      if (t.includes("api") || t.includes("endpoint")) topics.push("API design");
      if (t.includes("test") || t.includes("تست")) topics.push("testing");
      if (/```|def |function |class |const |let |var /.test(t)) topics.push("code-review");
    });

    const unique = [...new Set(topics)];
    return {
      messageCount: prior.length,
      topics: unique,
      lastUser: prior.filter((m) => m.role === "user").slice(-1)[0]?.content || "",
      lastAssistant: prior.filter((m) => m.role === "assistant").slice(-1)[0]?.content || "",
    };
  }

  function detectIntent(text) {
    const t = text.toLowerCase();
    if (/```|def |function |class |const |let |var |import /.test(t) || t.includes("این کد") || t.includes("this code")) {
      return "code-review";
    }
    if (t.includes("bug") || t.includes("error") || t.includes("خطا") || t.includes("اشکال") || t.includes("fix")) {
      return "debug";
    }
    if (t.includes("refactor") || t.includes("تمیز") || t.includes("بهتر") || t.includes("improve") || t.includes("clean")) {
      return "refactor";
    }
    if (t.includes("یاد") || t.includes("learn") || t.includes("شروع") || t.includes("example") || t.includes("مثال") || t.includes("چطور") || t.includes("how")) {
      return "explain";
    }
    if (t.includes("decorator")) return "decorator";
    if (t.includes("hello") || t.includes("سلام") || t.includes("hi ") || t === "hi") return "greeting";
    return "general";
  }

  /**
   * Context-aware mock response generator.
   * Uses the full conversation history of the ACTIVE conversation only.
   */
  function generateContextualReply(userText, history) {
    const ctx = buildContextSummary(history);
    const intent = detectIntent(userText);
    const hasContext = ctx && ctx.messageCount > 0;
    const topicHint = hasContext && ctx.topics.length
      ? ctx.topics.slice(0, 3).join(", ")
      : null;

    // --- Greeting ---
    if (intent === "greeting") {
      return hasContext
        ? `سلام دوباره! 👋 هنوز روی موضوع **${topicHint || "قبلی"}** کار می‌کنیم. چه کمکی نیاز داری؟`
        : "سلام! من **Nova** هستم، دستیار کدنویسی تو.\n\nمی‌تونی کد بفرستی، باگ بپرسی، یا درخواست توضیح/refactor بدی.";
    }

    // --- Code review ---
    if (intent === "code-review") {
      let reply = "کدت رو بررسی کردم.\n\n";
      if (hasContext && topicHint) {
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
      if (hasContext) {
        reply += `با توجه به پیام‌های قبلی این Conversation`;
        if (topicHint) reply += ` (موضوع: **${topicHint}**)`;
        reply += "، احتمالاً مشکل از اینجا است:\n\n";
      } else {
        reply += "برای پیدا کردن باگ، این موارد را چک کن:\n\n";
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

    // --- Decorator specific ---
    if (intent === "decorator") {
      return "یک مثال ساده از **decorator** در Python:\n\n```python\ndef log_calls(fn):\n    def wrapper(*args, **kwargs):\n        print(f\"Calling {fn.__name__}\")\n        return fn(*args, **kwargs)\n    return wrapper\n\n@log_calls\ndef add(a, b):\n    return a + b\n\nprint(add(2, 3))  # Calling add → 5\n```\n\ndecorator تابع را می‌گیرد، یک تابع جدید برمی‌گرداند و رفتار اضافه می‌کند بدون تغییر خود تابع اصلی.\n\nاگر بخوای نسخه با `functools.wraps` یا class-based هم بگم.";
    }

    // --- Explain / learn ---
    if (intent === "explain") {
      let reply = "";
      if (hasContext && topicHint) {
        reply += `ادامه همان مسیر **${topicHint}**:\n\n`;
      } else {
        reply += "بگذار مرحله‌به‌مرحله توضیح بدهم:\n\n";
      }
      reply += "1. مفهوم را ساده تعریف کن\n";
      reply += "2. یک مثال خیلی کوچک بنویس\n";
      reply += "3. یک edge-case نشان بده\n";
      reply += "4. تمرین کوتاه برای خودت بساز\n\n";
      reply += "موضوع دقیق‌تری بگو (مثلاً list comprehension، async/await، closure) تا مثال عملی بزنم.";
      return reply;
    }

    // --- Follow-up / general with context ---
    if (hasContext) {
      const lastUserShort = (ctx.lastUser || "").slice(0, 80);
      let reply = `پیامت را در ادامه مکالمه فعلی فهمیدم`;
      if (topicHint) reply += ` (موضوع‌های باز: **${topicHint}**)`;
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

    // --- First message, general ---
    return "پیامت را دریافت کردم.\n\nبرای کمک بهتر می‌توانی:\n- یک **تکه کد** بفرستی\n- بگی **چه خطایی** می‌گیری\n- یا بپرسی **چطور بهتر بنویسم**\n\nمن **Nova** هستم و Context همین چت را تا آخر نگه می‌دارم. هر سوالی داری بپرس.";
  }

  function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ---------- Public actions ----------
  async function sendMessage(text) {
    text = (text || "").trim();
    if (!text || isProcessing) return;

    // Guard against extremely long input
    if (text.length > AppConfig.ui.maxMessageLength) {
      text = text.slice(0, AppConfig.ui.maxMessageLength);
    }

    let conv = getActive();
    if (!conv) {
      conv = createConversation();
    }

    // Snapshot conversation id so a late response can't leak into another chat
    const convIdAtSend = conv.id;

    conv.messages.push({ role: "user", content: text, ts: Date.now() });
    updateTitleFromFirstMessage(conv, text);
    renderConversationList();
    renderMessages();

    isProcessing = true;
    UI.setComposerDisabled(true);

    const container = UI.getElements().messagesContainer;
    const loadingEl = createMessageElement("assistant", "", true);
    loadingEl.id = "loading-msg";
    if (container) {
      container.appendChild(loadingEl);
      UI.scrollToBottom();
    }

    const wait =
      AppConfig.ui.typingDelayMin +
      Math.random() * (AppConfig.ui.typingDelayMax - AppConfig.ui.typingDelayMin);
    await delay(wait);

    // If user switched conversation while waiting, still store reply on original conv
    const targetConv = conversations.find((c) => c.id === convIdAtSend) || conv;

    let reply;
    if (AppConfig.useMockAI) {
      // Pass FULL history of this conversation (including the new user message)
      reply = generateContextualReply(text, targetConv.messages);
    } else {
      reply = "Real API is not connected yet. Set useMockAI to true or connect a backend.";
    }

    const loading = document.getElementById("loading-msg");
    if (loading) loading.remove();

    targetConv.messages.push({ role: "assistant", content: reply, ts: Date.now() });

    // Only re-render if still viewing that conversation
    if (activeId === convIdAtSend) {
      renderMessages();
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
    if (conversations.length === 0) {
      createConversation();
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
  };
})();
