"""
AI Provider abstraction layer.
Supports any OpenAI-compatible API (OpenAI, Groq, OpenRouter, Together, local, etc.).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List, Optional

from openai import OpenAI, APIError, AuthenticationError, RateLimitError, APIConnectionError

from config import AIConfig


class BaseProvider(ABC):
    """Abstract base class for AI providers."""

    @abstractmethod
    def chat(
        self,
        messages: List[dict],
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> str:
        """Generate a response given a list of messages."""
        ...


class OpenAICompatibleProvider(BaseProvider):
    """Provider that works with any OpenAI-compatible endpoint."""

    def __init__(self, config: AIConfig) -> None:
        self.config = config
        self.client = OpenAI(
            api_key=config.api_key,
            base_url=config.base_url,
            timeout=60.0,
        )

    def chat(
        self,
        messages: List[dict],
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> str:
        """Call the LLM and return the assistant's reply text.

        Raises:
            ProviderError: On any recoverable or configuration error.
        """
        try:
            response = self.client.chat.completions.create(
                model=self.config.model,
                messages=messages,
                temperature=temperature if temperature is not None else self.config.temperature,
                max_tokens=max_tokens if max_tokens is not None else self.config.max_tokens,
            )
            content = response.choices[0].message.content
            if content is None:
                raise ProviderError("Empty response received from the model.")
            return content.strip()

        except AuthenticationError as exc:
            raise ProviderError(
                "Authentication failed. Please check your AI_API_KEY."
            ) from exc
        except RateLimitError as exc:
            raise ProviderError(
                "Rate limit exceeded. Please wait a moment and try again."
            ) from exc
        except APIConnectionError as exc:
            raise ProviderError(
                "Could not connect to the AI provider. Check your internet connection "
                "and AI_BASE_URL."
            ) from exc
        except APIError as exc:
            raise ProviderError(f"Provider API error: {exc.message or str(exc)}") from exc
        except Exception as exc:  # noqa: BLE001
            raise ProviderError(f"Unexpected error while calling the model: {exc}") from exc


class ProviderError(Exception):
    """Raised when the AI provider fails in a user-facing way."""

    pass


def create_provider(config: AIConfig) -> BaseProvider:
    """Factory that returns the appropriate provider instance."""
    # Currently only OpenAI-compatible is supported.
    # Future versions can switch based on config.provider_type.
    return OpenAICompatibleProvider(config)
