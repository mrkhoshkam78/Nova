# Personal Coding AI

**Version 1.0 – AI Chat Core**

An open-source, modular foundation for a personal coding AI assistant.  
Talk to it in natural language, paste code snippets, ask for explanations, bug analysis, or better implementations.

> This is **not** a keyword-based chatbot. It uses a real LLM through an OpenAI-compatible provider.

---

## Features (V1)

- Natural language conversation (Persian, English, …)
- Coding-oriented system prompt
- Full conversation context kept in memory during the session
- Support for pasting code snippets directly in the chat
- Clean, responsive Streamlit UI
- Provider abstraction – switch models/providers without rewriting core logic
- Secrets loaded only from environment variables
- Modular architecture ready for future versions

## Architecture

```
User
 ↓
Streamlit Chat UI
 ↓
AI Engine
 ↓
Conversation Manager (runtime context)
 ↓
AI Provider (OpenAI-compatible)
 ↓
LLM (OpenAI / Groq / OpenRouter / local / …)
 ↓
Response
```

### Project Structure

```
personal-coding-ai/
├── app/
│   ├── main.py              # Streamlit UI
│   ├── config.py            # Environment-based configuration
│   ├── ai/
│   │   ├── engine.py        # Core orchestration + system prompt
│   │   └── provider.py      # Abstract + OpenAI-compatible provider
│   └── chat/
│       └── conversation.py  # In-memory conversation management
├── tests/
│   └── test_conversation.py
├── main.py                  # Entry point
├── requirements.txt
├── .env.example
├── .gitignore
└── README.md
```

## Requirements

- Python 3.10+
- An API key from any OpenAI-compatible provider (OpenAI, Groq, OpenRouter, Together, Fireworks, local Ollama with OpenAI compatibility, etc.)

## Installation

```bash
git clone https://github.com/YOUR_USERNAME/personal-coding-ai.git
cd personal-coding-ai

python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate

pip install -r requirements.txt
```

## Environment Variables

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

| Variable         | Required | Default                     | Description                          |
|------------------|----------|-----------------------------|--------------------------------------|
| `AI_API_KEY`     | Yes      | –                           | Your API key                         |
| `AI_MODEL`       | No       | `gpt-4o-mini`               | Model name                           |
| `AI_BASE_URL`    | No       | `https://api.openai.com/v1` | Base URL of the provider             |
| `AI_TEMPERATURE` | No       | `0.7`                       | Sampling temperature                 |
| `AI_MAX_TOKENS`  | No       | `2048`                      | Maximum tokens in the reply          |

**Never commit your `.env` file.**

## Running the Project

```bash
streamlit run main.py
```

The app will open in your browser (usually http://localhost:8501).

## Usage Examples

- “این تابع وقتی null می‌گیره خطا می‌ده، می‌تونی بررسی کنی؟”
- Paste a function and ask: “Explain this code and point out any bugs.”
- “How can I write this more cleanly?”
- “What’s the difference between `list` and `tuple` in Python?”

The assistant keeps the conversation context for the whole session.  
Click **New Chat** in the sidebar to start fresh.

## Testing

Unit tests (no network required):

```bash
pip install pytest
pytest tests/ -v
```

Manual testing checklist (real user simulation):

1. Start the app
2. Ask a normal question
3. Ask a coding question
4. Paste a code snippet and request analysis
5. Continue the conversation (context should be preserved)
6. Start a New Chat
7. Test with missing/invalid API key (error should be clear)
8. Restart the application

## Troubleshooting

| Problem                        | Solution                                      |
|--------------------------------|-----------------------------------------------|
| `AI_API_KEY is not set`        | Create `.env` from `.env.example`             |
| Authentication failed          | Check the key and that the provider is correct|
| Connection error               | Verify `AI_BASE_URL` and internet access      |
| Empty / strange replies        | Try a different model or lower temperature    |

## Roadmap

| Version | Focus                              |
|---------|------------------------------------|
| **V1.0**    | AI Chat Core (this release)        |
| V2.0    | Persistent Memory                  |
| V3.0    | Project & File Understanding       |
| V4.0    | Code Analysis Engine               |
| V5.0    | Tools & Terminal Access            |
| V6.0    | Web Search & Documentation         |
| V7.0    | Coding Agent                       |
| V8.0    | Advanced Personal AI               |

## License

MIT License – feel free to use, modify, and build upon this project.

---

Built as a clean, modular foundation for a real personal coding AI.
