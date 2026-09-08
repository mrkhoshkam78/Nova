"""Source normalization: encoding, BOM, line endings, metadata, hash, empty/binary detection."""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any, Dict, Optional
import hashlib
import re


@dataclass
class NormalizedSource:
    original_bytes_len: int
    content: str
    encoding: str
    had_bom: bool
    line_ending: str  # "lf" | "crlf" | "cr" | "mixed" | "none"
    line_count: int
    content_hash: str
    is_empty: bool
    is_binary: bool
    metadata: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def _detect_bom(data: bytes) -> tuple[bool, str, bytes]:
    if data.startswith(b"\xef\xbb\xbf"):
        return True, "utf-8-sig", data[3:]
    if data.startswith(b"\xff\xfe"):
        return True, "utf-16-le", data[2:]
    if data.startswith(b"\xfe\xff"):
        return True, "utf-16-be", data[2:]
    return False, "utf-8", data


def _detect_line_ending(text: str) -> str:
    crlf = text.count("\r\n")
    # count remaining \r and \n after removing CRLF pairs
    tmp = text.replace("\r\n", "")
    cr = tmp.count("\r")
    lf = tmp.count("\n")
    kinds = sum(1 for x in (crlf, cr, lf) if x > 0)
    if kinds == 0:
        return "none"
    if kinds > 1:
        return "mixed"
    if crlf:
        return "crlf"
    if cr:
        return "cr"
    return "lf"


def _is_binary(data: bytes, sample: int = 8192) -> bool:
    sample_data = data[:sample]
    if b"\x00" in sample_data:
        return True
    # high proportion of non-text control chars
    control = sum(1 for b in sample_data if b < 9 or (13 < b < 32) or b == 127)
    if len(sample_data) > 0 and control / len(sample_data) > 0.3:
        return True
    return False


def normalize(
    raw: bytes | str,
    file_name: Optional[str] = None,
    declared_encoding: Optional[str] = None,
) -> NormalizedSource:
    if isinstance(raw, str):
        data = raw.encode("utf-8", errors="replace")
        original_len = len(data)
        had_bom = False
        encoding = "utf-8"
        text = raw
    else:
        original_len = len(raw)
        if _is_binary(raw):
            return NormalizedSource(
                original_bytes_len=original_len,
                content="",
                encoding="binary",
                had_bom=False,
                line_ending="none",
                line_count=0,
                content_hash=hashlib.sha256(raw).hexdigest()[:32],
                is_empty=False,
                is_binary=True,
                metadata={"file_name": file_name},
            )
        had_bom, encoding, payload = _detect_bom(raw)
        if declared_encoding:
            encoding = declared_encoding
        try:
            text = payload.decode(encoding, errors="strict")
        except (UnicodeDecodeError, LookupError):
            try:
                text = payload.decode("utf-8", errors="replace")
                encoding = "utf-8-replace"
            except Exception:
                text = payload.decode("latin-1", errors="replace")
                encoding = "latin-1"

    # Normalize line endings to LF for analysis (source location mapping uses original offsets carefully)
    # We keep content with LF; original line numbers still match after split.
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    line_ending = _detect_line_ending(text)
    lines = normalized.split("\n")
    # trailing empty from final newline is ok
    line_count = len(lines) if normalized else 0
    is_empty = not normalized.strip()
    ch = hashlib.sha256(normalized.encode("utf-8", errors="replace")).hexdigest()[:32]

    return NormalizedSource(
        original_bytes_len=original_len,
        content=normalized,
        encoding=encoding,
        had_bom=had_bom,
        line_ending=line_ending,
        line_count=line_count,
        content_hash=ch,
        is_empty=is_empty,
        is_binary=False,
        metadata={"file_name": file_name},
    )
