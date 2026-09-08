# Nova

**Version 2.0 – Real LLM Coding Assistant**

An open-source, modular foundation for a coding AI assistant (Nova).  
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
- Flat, simple structure ready for future versions

## Architecture

```
User
 ↓
Streamlit Chat UI (main.py)
 ↓
AI Engine (ai_engine.py)
 ↓
Conversation Manager (conversation.py)  – runtime context
 ↓
AI Provider (ai_provider.py)  – OpenAI-compatible
 ↓
LLM (OpenAI / Groq / OpenRouter / local / …)
 ↓
Response
```

### Project Structure

```
personal-coding-ai/
├── index.html           # Frontend UI (open in browser)
├── css/
│   └── style.css
├── js/
│   ├── config.js
│   ├── ui.js
│   ├── chat.js
│   └── app.js
├── assets/
│   └── icons/
│
├── main.py              # Optional Streamlit backend entry
├── config.py            # Python config (for future API)
├── ai_engine.py
├── ai_provider.py
├── conversation.py
├── tests.py
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
git clone https://github.com/mrkhoshkam78/Nova.git
cd Nova

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


## Running Nova V2 (LLM Gateway)

Terminal 1 – start the secure gateway (API key stays on the server):

```bash
cp .env.example .env   # set AI_API_KEY
pip install -r requirements.txt
python server.py
```

Terminal 2 – open the UI:

```bash
python -m http.server 8080
# open http://localhost:8080
```

The frontend talks only to `http://127.0.0.1:8000` (no secrets in the browser).

## Running the Project

### Frontend UI (V1.0 – recommended for now)

Simply open `index.html` in your browser, or serve it locally:

```bash
# Option 1 – open directly
open index.html          # macOS
start index.html         # Windows
xdg-open index.html      # Linux

# Option 2 – simple local server (recommended)
python -m http.server 8080
# then open http://localhost:8080
```

The UI includes a **Mock AI** so you can test chat, code blocks, New Chat, sidebar, etc. without any API key.

### Python / Streamlit backend (optional)

```bash
pip install -r requirements.txt
cp .env.example .env     # set AI_API_KEY
streamlit run main.py
```

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
pytest tests.py -v
```

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

Built as a clean, flat, modular foundation for a real personal coding AI.
