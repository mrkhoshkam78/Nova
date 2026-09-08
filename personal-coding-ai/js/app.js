/**
 * app.js – Application bootstrap & event wiring
 */

(function () {
  "use strict";

  function bindEvents() {
    const els = UI.getElements();

    // Sidebar toggle
    if (els.sidebarToggle) {
      els.sidebarToggle.addEventListener("click", () => UI.toggleSidebar());
    }

    // Mobile overlay closes sidebar
    if (els.mobileOverlay) {
      els.mobileOverlay.addEventListener("click", () => UI.closeSidebar());
    }

    // New Chat
    if (els.newChatBtn) {
      els.newChatBtn.addEventListener("click", () => {
        Chat.newChat();
        if (UI.isMobile()) UI.closeSidebar();
      });
    }

    // Send button
    if (els.sendBtn) {
      els.sendBtn.addEventListener("click", () => {
        const text = els.messageInput ? els.messageInput.value : "";
        Chat.sendMessage(text);
      });
    }

    // Enter to send (Shift+Enter for newline)
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

    // Settings
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

    // Responsive: close sidebar on large resize if needed
    window.addEventListener("resize", () => {
      if (!UI.isMobile()) {
        // On desktop keep sidebar behavior controlled by CSS
        document.body.classList.remove("sidebar-open");
        if (els.mobileOverlay) els.mobileOverlay.classList.remove("visible");
      }
    });
  }

  function boot() {
    UI.cacheElements();
    bindEvents();
    Chat.init();

    // Status
    UI.setStatus(true, "Ready (Mock AI)");

    // Focus input
    const input = UI.getElements().messageInput;
    if (input) input.focus();

    console.log(
      `%c ${AppConfig.appName} v${AppConfig.version} `,
      "background:#6366f1;color:#fff;padding:4px 8px;border-radius:4px;"
    );
  }

  // Start when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
