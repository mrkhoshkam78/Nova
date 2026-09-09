"""
Configuration management for Personal Coding AI.
All sensitive settings are loaded from environment variables.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

from dotenv import load_dotenv


load_dotenv()


@dataclass(frozen=True)
class AIConfig:
    """Immutable configuration for the AI provider."""

    api_key: str
    model: str
    base_url: str
    temperature: float = 0.7
    max_tokens: int = 2048

    @classmethod
    def from_env(cls) -> "AIConfig":
        """Load configuration from environment variables.

        Raises:
            ValueError: If required environment variables are missing.
        """
        api_key = os.getenv("AI_API_KEY", "").strip()
        if not api_key or api_key == "your_api_key_here":
            raise ValueError(
                "AI_API_KEY is not set. Please create a .env file based on .env.example "
                "and set a valid API key."
            )

        model = os.getenv("AI_MODEL", "gpt-4o-mini").strip()
        base_url = os.getenv("AI_BASE_URL", "https://api.openai.com/v1").strip()

        try:
            temperature = float(os.getenv("AI_TEMPERATURE", "0.7"))
        except ValueError:
            temperature = 0.7

        try:
            max_tokens = int(os.getenv("AI_MAX_TOKENS", "2048"))
        except ValueError:
            max_tokens = 2048

        return cls(
            api_key=api_key,
            model=model,
            base_url=base_url,
            temperature=temperature,
            max_tokens=max_tokens,
        )


def get_config() -> AIConfig:
    """Convenience helper to load AI configuration."""
    return AIConfig.from_env()
