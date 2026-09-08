/**
 * config.js – Nova V2 application configuration
 * API keys are NEVER stored here. Only the public gateway URL.
 */

const AppConfig = window.AppConfig = {
  appName: "Nova",
  version: "2.0.1",

  // Prefer real LLM via gateway. Mock only when gateway is unreachable.
  useMockAI: false,
  // If gateway is down, fall back to local mock so UI remains usable
  mockFallbackOnOffline: true,

  api: {
    baseUrl: localStorage.getItem("nova_gateway_url") || "http://127.0.0.1:8000",
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

// Runtime flags (mutable)
window.NovaRuntime = {
  gatewayOnline: false,
  llmConfigured: false,
  forceMock: false,
};
