/**
 * chat.js – Conversation state + message rendering + Mock AI
 */

const Chat = (() => {
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
   * Very lightweight markdown-ish renderer for V1:
   * - **bold**
   * - `inline code`
   * - ```code blocks```
   * - newlines → <br>
   */
  function renderContent(raw) {
    if (!raw) return "";

    // Extract fenced code blocks first
    const blocks = [];
    let text = raw.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      const id = blocks.length;
      blocks.push({ lang: lang || "text", code: code.trimEnd() });
      return `\n%%CODEBLOCK_${id}%%\n`;
    });

    // Escape remaining text
    text = escapeHtml(text);

    // Inline code
    text = text.replace(/`([^`]+)`/g, "<code class=\"inline-code\">$1</code>");

    // Bold
    text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

    // Newlines
    text = text.replace(/\n/g, "<br>");

    // Restore code blocks
    text = text.replace(/%%CODEBLOCK_(\d+)%%/g, (_, idx) => {
      const b = blocks[Number(idx)];
      const codeHtml = escapeHtml(b.code);
      return `
        <div class="code-block">
          <div class="code-header">
            <span class="code-lang">${escapeHtml(b.lang)}</span>
            <button class="copy-btn" data-code="${encodeURIComponent(b.code)}" title="Copy code">
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
    avatar.textContent = role === "user" ? "U" : "AI";

    const body = document.createElement("div");
    body.className = "message-body";

    if (isLoading) {
      body.innerHTML = `
        <div class="typing-indicator">
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
      const clean = text.replace(/\s+/g, " ").trim().slice(0, 40);
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

    // Attach copy handlers
    container.querySelectorAll(".copy-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const code = decodeURIComponent(btn.dataset.code || "");
        try {
          await navigator.clipboard.writeText(code);
          const span = btn.querySelector("span");
          if (span) {
            const prev = span.textContent;
            span.textContent = "Copied!";
            setTimeout(() => (span.textContent = prev), 1500);
          }
        } catch {
          // fallback
          alert("Could not copy to clipboard");
        }
      });
    });

    UI.scrollToBottom(false);
  }

  function switchConversation(id) {
    setActive(id);
    renderConversationList();
    renderMessages();
  }

  // ---------- Mock AI ----------
  function getMockResponse(userText) {
    const list = AppConfig.mockResponses;
    // Simple heuristic: if code-like, prefer code response
    if (userText.includes("def ") || userText.includes("function ") || userText.includes("```")) {
      return list[1] || list[0];
    }
    if (userText.includes("خطا") || userText.toLowerCase().includes("error") || userText.includes("bug")) {
      return list[3] || list[0];
    }
    if (userText.includes("یاد") || userText.toLowerCase().includes("learn") || userText.includes("شروع")) {
      return list[2] || list[0];
    }
    // Random otherwise
    return list[Math.floor(Math.random() * list.length)];
  }

  function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ---------- Public actions ----------
  async function sendMessage(text) {
    text = (text || "").trim();
    if (!text || isProcessing) return;

    let conv = getActive();
    if (!conv) {
      conv = createConversation();
    }

    // Add user message
    conv.messages.push({ role: "user", content: text, ts: Date.now() });
    updateTitleFromFirstMessage(conv, text);
    renderConversationList();
    renderMessages();

    // Show loading
    isProcessing = true;
    UI.setComposerDisabled(true);
    const container = UI.getElements().messagesContainer;
    const loadingEl = createMessageElement("assistant", "", true);
    loadingEl.id = "loading-msg";
    container.appendChild(loadingEl);
    UI.scrollToBottom();

    // Simulate network / thinking
    const wait = AppConfig.ui.typingDelayMin +
      Math.random() * (AppConfig.ui.typingDelayMax - AppConfig.ui.typingDelayMin);
    await delay(wait);

    // Generate reply
    let reply;
    if (AppConfig.useMockAI) {
      reply = getMockResponse(text);
    } else {
      // Placeholder for future real API
      reply = "Real API is not connected yet. Enable mock mode or connect a backend.";
    }

    // Remove loading & add real reply
    const loading = document.getElementById("loading-msg");
    if (loading) loading.remove();

    conv.messages.push({ role: "assistant", content: reply, ts: Date.now() });
    renderMessages();

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
    createConversation();
    renderConversationList();
    renderMessages();
    const input = UI.getElements().messageInput;
    if (input) input.focus();
  }

  function init() {
    // Start with one empty conversation so UI feels ready
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
