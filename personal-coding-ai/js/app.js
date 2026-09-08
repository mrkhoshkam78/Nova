/**
 * app.js – Application bootstrap & event wiring
 */

(function () {
  "use strict";

  function bindEvents() {
    const els = UI.getElements();

    if (els.sidebarToggle) {
      els.sidebarToggle.addEventListener("click", () => UI.toggleSidebar());
    }

    if (els.mobileOverlay) {
      els.mobileOverlay.addEventListener("click", () => UI.closeSidebar());
    }

    if (els.newChatBtn) {
      els.newChatBtn.addEventListener("click", () => {
        Chat.newChat();
        if (UI.isMobile()) UI.closeSidebar();
      });
    }

    if (els.sendBtn) {
      els.sendBtn.addEventListener("click", () => {
        const text = els.messageInput ? els.messageInput.value : "";
        Chat.sendMessage(text);
      });
    }

    if (els.messageInput) {
      els.messageInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          Chat.sendMessage(els.messageInput.value);
        }
      });

      els.messageInput.addEventListener("input", () => {
        UI.autoResizeTextarea();
      });
    }

    if (els.settingsBtn) {
      els.settingsBtn.addEventListener("click", () => UI.openSettings());
    }
    if (els.closeSettingsBtn) {
      els.closeSettingsBtn.addEventListener("click", () => UI.closeSettings());
    }
    if (els.settingsModal) {
      els.settingsModal.addEventListener("click", (e) => {
        if (e.target === els.settingsModal) UI.closeSettings();
      });
    }

    // Escape closes settings / sidebar on mobile
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (typeof Chat !== "undefined" && Chat.stopGeneration) Chat.stopGeneration();
        UI.closeSettings();
        if (UI.isMobile()) UI.closeSidebar();
      }
    });

    window.addEventListener("resize", () => {
      if (!UI.isMobile()) {
        document.body.classList.remove("sidebar-open");
        if (els.mobileOverlay) els.mobileOverlay.classList.remove("visible");
        if (els.sidebar) els.sidebar.classList.remove("open");
      }
    });
  }

  async function checkGateway() {
    const base = (AppConfig.api && AppConfig.api.baseUrl) || "";
    if (AppConfig.useMockAI) {
      UI.setStatus(true, "Ready (Mock)");
      return;
    }
    try {
      const res = await fetch(base.replace(/\/$/, "") + (AppConfig.api.healthEndpoint || "/health"), {
        method: "GET",
      });
      if (!res.ok) throw new Error("bad status");
      const data = await res.json();
      if (data.llm_configured) {
        UI.setStatus(true, "Ready · " + (data.model || "LLM"));
      } else {
        UI.setStatus(false, "Gateway up · set AI_API_KEY");
      }
    } catch (_) {
      UI.setStatus(false, "Gateway offline");
    }
  }

  function boot() {

    UI.cacheElements();
    bindEvents();
    Chat.init();

    UI.setStatus(false, "Checking gateway…");
    checkGateway();

    const input = UI.getElements().messageInput;
    if (input) input.focus();

    console.log(
      `%c ${AppConfig.appName} v${AppConfig.version} `,
      "background:#6366f1;color:#fff;padding:4px 8px;border-radius:4px;"
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
