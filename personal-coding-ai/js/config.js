/**
 * config.js – Nova V2 application configuration
 * API keys are NEVER stored here. Only the public gateway URL.
 */

const AppConfig = window.AppConfig = {
  appName: "Nova",
  version: "2.0.0",

  // Prefer real LLM via gateway. Mock is development fallback only.
  useMockAI: false,

  api: {
    // Public gateway base URL (no secrets)
    baseUrl: "http://127.0.0.1:8000",
    chatEndpoint: "/api/chat",
    healthEndpoint: "/health",
    timeoutMs: 120000,
  },

  ui: {
    sidebarOpenOnDesktop: true,
    maxMessageLength: 8000,
    typingDelayMin: 400,
    typingDelayMax: 900,
  },
};

Object.freeze(AppConfig);
Object.freeze(AppConfig.api);
Object.freeze(AppConfig.ui);
