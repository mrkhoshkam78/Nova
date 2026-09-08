/**
 * ui.js – DOM helpers and UI state management
 */

const UI = (() => {
  // Cached elements
  let els = {};

  function cacheElements() {
    els = {
      sidebar: document.getElementById("sidebar"),
      sidebarToggle: document.getElementById("sidebar-toggle"),
      mobileOverlay: document.getElementById("mobile-overlay"),
      newChatBtn: document.getElementById("new-chat-btn"),
      conversationList: document.getElementById("conversation-list"),
      chatArea: document.getElementById("chat-area"),
      messagesContainer: document.getElementById("messages"),
      emptyState: document.getElementById("empty-state"),
      composer: document.getElementById("composer"),
      messageInput: document.getElementById("message-input"),
      sendBtn: document.getElementById("send-btn"),
      statusDot: document.getElementById("status-dot"),
      statusText: document.getElementById("status-text"),
      settingsBtn: document.getElementById("settings-btn"),
      settingsModal: document.getElementById("settings-modal"),
      closeSettingsBtn: document.getElementById("close-settings"),
      themeSelect: document.getElementById("theme-select"),
    };
  }

  function isMobile() {
    return window.innerWidth < 768;
  }

  function openSidebar() {
    if (!els.sidebar) return;
    els.sidebar.classList.add("open");
    if (els.mobileOverlay) els.mobileOverlay.classList.add("visible");
    document.body.classList.add("sidebar-open");
  }

  function closeSidebar() {
    if (!els.sidebar) return;
    els.sidebar.classList.remove("open");
    if (els.mobileOverlay) els.mobileOverlay.classList.remove("visible");
    document.body.classList.remove("sidebar-open");
  }

  function toggleSidebar() {
    if (els.sidebar && els.sidebar.classList.contains("open")) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }

  function setStatus(connected, text) {
    if (els.statusDot) {
      els.statusDot.classList.toggle("online", connected);
      els.statusDot.classList.toggle("offline", !connected);
    }
    if (els.statusText) {
      els.statusText.textContent = text || (connected ? "Ready" : "Offline");
    }
  }

  function showEmptyState(show) {
    if (els.emptyState) {
      els.emptyState.style.display = show ? "flex" : "none";
    }
    if (els.messagesContainer) {
      els.messagesContainer.style.display = show ? "none" : "flex";
    }
  }

  function clearMessages() {
    if (els.messagesContainer) {
      els.messagesContainer.innerHTML = "";
    }
    showEmptyState(true);
  }

  function autoResizeTextarea() {
    const ta = els.messageInput;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 180) + "px";
  }

  function setComposerDisabled(disabled) {
    if (els.messageInput) els.messageInput.disabled = disabled;
    if (els.sendBtn) els.sendBtn.disabled = disabled;
  }

  function openSettings() {
    if (els.settingsModal) {
      els.settingsModal.classList.add("open");
    }
  }

  function closeSettings() {
    if (els.settingsModal) {
      els.settingsModal.classList.remove("open");
    }
  }

  function scrollToBottom(smooth = true) {
    if (!els.chatArea) return;
    els.chatArea.scrollTo({
      top: els.chatArea.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  }

  function getElements() {
    return els;
  }

  return {
    cacheElements,
    isMobile,
    openSidebar,
    closeSidebar,
    toggleSidebar,
    setStatus,
    showEmptyState,
    clearMessages,
    autoResizeTextarea,
    setComposerDisabled,
    openSettings,
    closeSettings,
    scrollToBottom,
    getElements,
  };
})();
