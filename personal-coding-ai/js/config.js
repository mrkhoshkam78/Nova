/**
 * config.js – Application configuration & constants
 * Ready for future real API integration.
 */

const AppConfig = window.AppConfig = {
  appName: "Nova",
  version: "1.0.0",

  // Mock mode for V1 (set to false later when real API is connected)
  useMockAI: true,

  // Future API settings (not used in mock mode)
  api: {
    baseUrl: "",
    endpoint: "/chat",
    timeoutMs: 30000,
  },

  // UI defaults
  ui: {
    sidebarOpenOnDesktop: true,
    maxMessageLength: 8000,
    typingDelayMin: 500,
    typingDelayMax: 1100,
  },
};

Object.freeze(AppConfig);
Object.freeze(AppConfig.api);
Object.freeze(AppConfig.ui);
