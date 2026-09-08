"""
Streamlit Chat Interface for Personal Coding AI – Version 1.0
"""

from __future__ import annotations

import streamlit as st

from ai_engine import AIEngine
from ai_provider import ProviderError
from config import AIConfig


# ---------------------------------------------------------------------------
# Page config & simple styling
# ---------------------------------------------------------------------------
st.set_page_config(
    page_title="Personal Coding AI",
    page_icon="🤖",
    layout="centered",
    initial_sidebar_state="collapsed",
)

st.markdown(
    """
    <style>
    .stApp {
        max-width: 900px;
        margin: 0 auto;
    }
    div[data-testid="stChatInput"] {
        position: sticky;
        bottom: 0;
    }
    </style>
    """,
    unsafe_allow_html=True,
)


def init_engine() -> AIEngine | None:
    """Initialize (or retrieve) the AI engine from session state."""
    if "engine" in st.session_state:
        return st.session_state.engine

    try:
        config = AIConfig.from_env()
        engine = AIEngine(config=config)
        st.session_state.engine = engine
        return engine
    except ValueError as exc:
        st.error(str(exc))
        st.info(
            "Create a `.env` file in the project root based on `.env.example` "
            "and set a valid `AI_API_KEY`."
        )
        st.stop()
        return None


def render_header() -> None:
    st.title("🤖 Personal Coding AI")
    st.caption("Version 1.0 — Your personal coding assistant")
    st.divider()


def main() -> None:
    render_header()

    engine = init_engine()
    if engine is None:
        return

    # Sidebar controls
    with st.sidebar:
        st.header("Controls")
        if st.button("🆕 New Chat", use_container_width=True, type="primary"):
            engine.new_chat()
            st.rerun()

        st.markdown("---")
        st.markdown("**Current Model**")
        st.code(engine.config.model, language=None)
        st.markdown("**Base URL**")
        st.code(engine.config.base_url, language=None)
        st.markdown("---")
        st.caption("Personal Coding AI v1.0")

    # Chat history
    messages = engine.get_history()
    if not messages:
        st.info(
            "👋 Start a conversation!\n\n"
            "You can ask questions, paste code snippets, request bug analysis, "
            "or ask for better implementations."
        )
    else:
        for msg in messages:
            with st.chat_message(msg.role):
                st.markdown(msg.content)

    # Input
    if user_input := st.chat_input("Type your message… (you can paste code too)"):
        # Add user message to UI immediately
        with st.chat_message("user"):
            st.markdown(user_input)

        # Generate reply
        with st.chat_message("assistant"):
            with st.spinner("Thinking…"):
                try:
                    reply = engine.send_message(user_input)
                    st.markdown(reply)
                except ValueError as exc:
                    st.warning(str(exc))
                except ProviderError as exc:
                    st.error(f"⚠️ {exc}")
                except Exception as exc:  # noqa: BLE001
                    st.error(f"Unexpected error: {exc}")


if __name__ == "__main__":
    main()
