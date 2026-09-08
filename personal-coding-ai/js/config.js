/**
 * config.js – Application configuration & constants
 * Ready for future real API integration.
 */

const AppConfig = {
  appName: "Personal Coding AI",
  version: "1.0.0",

  // Mock mode for V1 (set to false later when real API is connected)
  useMockAI: true,

  // Future API settings (not used in mock mode)
  api: {
    baseUrl: "",          // e.g. "http://localhost:8000"
    endpoint: "/chat",
    timeoutMs: 30000,
  },

  // UI defaults
  ui: {
    sidebarOpenOnDesktop: true,
    maxMessageLength: 8000,
    typingDelayMin: 600,
    typingDelayMax: 1400,
  },

  // Mock responses for testing the UI
  mockResponses: [
    "این یک پاسخ نمونه از **Personal Coding AI** است.\n\nدر نسخه فعلی از Mock استفاده می‌شود. در نسخه‌های بعدی به LLM واقعی متصل خواهد شد.",
    "کد شما را بررسی کردم. ساختار کلی خوب است، اما چند نکته وجود دارد:\n\n```python\ndef example():\n    # بهتر است از type hints استفاده کنید\n    return True\n```\n\nاگر بخواهید می‌توانم نسخه refactored آن را هم پیشنهاد بدهم.",
    "سوال خوبی پرسیدید!\n\nبرای شروع یادگیری Python پیشنهاد می‌کنم:\n1. مفاهیم پایه (variables, loops, functions)\n2. کار با لیست و دیکشنری\n3. نوشتن توابع کوچک و تست آن‌ها\n\nمی‌خواهید یک مثال عملی ببینید؟",
    "خطای احتمالی در کد شما مربوط به مدیریت `None` است.\n\n```python\n# قبل\nresult = items[0].value\n\n# بعد (ایمن‌تر)\nresult = items[0].value if items else None\n```\n\nاین تغییر از `AttributeError` جلوگیری می‌کند.",
  ],
};

// Freeze to prevent accidental mutation
Object.freeze(AppConfig);
Object.freeze(AppConfig.api);
Object.freeze(AppConfig.ui);
