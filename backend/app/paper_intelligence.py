"""Research-paper enrichment: PDF text, summaries, BibTeX, and paper Q&A."""

from __future__ import annotations

import re
from datetime import UTC, datetime
from io import BytesIO
from typing import Any

import httpx

from .config import settings
from .schemas import EntryOut

MAX_FULL_TEXT_CHARS = 180_000
MAX_OPENAI_CONTEXT_CHARS = 28_000


def _clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\x00", " ")).strip()


def _arxiv_pdf_url(metadata: dict[str, Any], url: str) -> str | None:
    arxiv_id = str(metadata.get("arxiv_id") or "").strip()
    if not arxiv_id and "arxiv.org/" in url:
        match = re.search(r"arxiv\.org/(?:abs|pdf)/([^/?#]+)", url, re.I)
        arxiv_id = match.group(1).removesuffix(".pdf") if match else ""
    return f"https://arxiv.org/pdf/{arxiv_id}.pdf" if arxiv_id else None


def _candidate_pdf_url(entry: EntryOut) -> str | None:
    metadata = dict(entry.metadata or {})
    url = str(metadata.get("url") or "").strip()
    if url.lower().endswith(".pdf"):
        return url
    if arxiv_url := _arxiv_pdf_url(metadata, url):
        return arxiv_url
    return None


def _extract_pdf_text(pdf_bytes: bytes) -> tuple[str, str | None]:
    try:
        from pypdf import PdfReader
    except ImportError:
        return "", "Install backend dependency pypdf by rerunning `pip install -e .[dev]`."

    reader = PdfReader(BytesIO(pdf_bytes))
    pages: list[str] = []
    for page in reader.pages[:80]:
        pages.append(page.extract_text() or "")
    text = _clean_text("\n".join(pages))
    if len(text) > MAX_FULL_TEXT_CHARS:
        text = text[:MAX_FULL_TEXT_CHARS]
    return text, None


def _download_and_extract(entry: EntryOut) -> tuple[str | None, str]:
    pdf_url = _candidate_pdf_url(entry)
    if not pdf_url:
        return None, "No public PDF URL detected yet. arXiv links and direct PDF links support full-text extraction now."
    try:
        response = httpx.get(pdf_url, timeout=20.0, follow_redirects=True)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        return None, f"Could not download PDF: {exc}"
    text, error = _extract_pdf_text(response.content)
    if error:
        return None, error
    if not text:
        return None, "PDF downloaded, but no selectable text was extracted."
    return text, f"Extracted {len(text):,} characters from {pdf_url}."


def _heuristic_summary(title: str, metadata: dict[str, Any], full_text: str | None) -> str:
    abstract = str(metadata.get("abstract") or "").strip()
    if abstract:
        return abstract[:1_200]
    if full_text:
        sentences = re.split(r"(?<=[.!?])\s+", full_text)
        usable = [sentence for sentence in sentences if 60 <= len(sentence) <= 320][:5]
        if usable:
            return " ".join(usable)[:1_200]
    return f"No abstract is available yet for {title}. Enrich with an arXiv or direct PDF link for a better summary."


def _openai_complete(system: str, user: str, max_tokens: int = 500) -> str | None:
    config = settings()
    if not config.openai_api_key:
        return None
    try:
        response = httpx.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {config.openai_api_key}", "Content-Type": "application/json"},
            json={
                "model": config.summary_model,
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
                "temperature": 0.2,
                "max_tokens": max_tokens,
            },
            timeout=35.0,
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"].strip()
    except (httpx.HTTPError, KeyError, IndexError, TypeError):
        return None


def summarize_paper(title: str, metadata: dict[str, Any], full_text: str | None) -> tuple[str, bool]:
    context = full_text or str(metadata.get("abstract") or "")
    if context:
        ai_summary = _openai_complete(
            "You summarize academic papers for a personal research assistant. Be accurate, concise, and concrete.",
            f"Paper title: {title}\n\nPaper text or abstract:\n{context[:MAX_OPENAI_CONTEXT_CHARS]}\n\nReturn: 1) core claim, 2) method, 3) useful takeaway, 4) what to read next.",
            max_tokens=650,
        )
        if ai_summary:
            return ai_summary, True
    return _heuristic_summary(title, metadata, full_text), False


def _bib_key(title: str, authors: list[str], year: str) -> str:
    first = (authors[0].split()[-1] if authors else title.split()[0] if title.split() else "paper").lower()
    first = re.sub(r"[^a-z0-9]+", "", first) or "paper"
    return f"{first}{year if year and year != 'n.d.' else 'nd'}"


def build_bibtex(entry: EntryOut, metadata: dict[str, Any]) -> str:
    title = str(metadata.get("title") or entry.title)
    authors = [str(author) for author in metadata.get("authors", []) if author]
    year = str(metadata.get("published_year") or "n.d.")
    key = _bib_key(title, authors, year)
    fields = [
        f"  title = {{{title}}}",
    ]
    if authors:
        fields.append(f"  author = {{{' and '.join(authors)}}}")
    if year != "n.d.":
        fields.append(f"  year = {{{year}}}")
    if metadata.get("doi"):
        fields.append(f"  doi = {{{metadata['doi']}}}")
    if metadata.get("arxiv_id"):
        fields.append(f"  eprint = {{{metadata['arxiv_id']}}}")
        fields.append("  archivePrefix = {arXiv}")
    if metadata.get("url"):
        fields.append(f"  url = {{{metadata['url']}}}")
    return "@article{" + key + ",\n" + ",\n".join(fields) + "\n}"


def enrich_paper(entry: EntryOut) -> tuple[dict[str, Any], str, bool]:
    metadata = dict(entry.metadata or {})
    full_text, extraction_message = _download_and_extract(entry)
    if full_text:
        metadata["paper_full_text"] = full_text
        metadata["paper_text_source"] = _candidate_pdf_url(entry)
        metadata["paper_text_char_count"] = len(full_text)
        metadata["paper_text_extracted_at"] = datetime.now(UTC).isoformat()

    summary, used_ai = summarize_paper(entry.title, metadata, full_text or metadata.get("paper_full_text"))
    metadata["paper_summary"] = summary
    metadata["paper_summary_used_ai"] = used_ai
    metadata["bibtex"] = build_bibtex(entry, metadata)
    metadata["paper_enriched_at"] = datetime.now(UTC).isoformat()
    return metadata, extraction_message, bool(full_text)


def _chunks(text: str, size: int = 1_400) -> list[str]:
    words = text.split()
    return [" ".join(words[index:index + size]) for index in range(0, len(words), size)]


def _top_chunks(question: str, text: str) -> list[str]:
    words = {word.lower() for word in re.findall(r"[a-zA-Z0-9]{4,}", question)}
    candidates = _chunks(text)
    scored = []
    for chunk in candidates:
        chunk_words = chunk.lower()
        score = sum(1 for word in words if word in chunk_words)
        scored.append((score, chunk))
    return [chunk for score, chunk in sorted(scored, key=lambda item: item[0], reverse=True)[:4] if score > 0] or candidates[:3]


def answer_paper_question(entry: EntryOut, question: str) -> tuple[str, list[str], bool]:
    metadata = dict(entry.metadata or {})
    source_text = str(metadata.get("paper_full_text") or metadata.get("paper_summary") or metadata.get("abstract") or entry.notes or "")
    if not source_text.strip():
        return "I do not have enough paper text yet. Run Enrich first with an arXiv or direct PDF link.", [], False
    chunks = _top_chunks(question, source_text)
    context = "\n\n---\n\n".join(chunks)[:MAX_OPENAI_CONTEXT_CHARS]
    ai_answer = _openai_complete(
        "Answer questions using only the supplied paper context. If the context is insufficient, say so.",
        f"Question: {question}\n\nPaper context:\n{context}",
        max_tokens=550,
    )
    if ai_answer:
        return ai_answer, [chunk[:360] for chunk in chunks], True
    answer = f"Most relevant paper notes:\n\n" + "\n\n".join(f"- {chunk[:420]}..." for chunk in chunks)
    return answer, [chunk[:360] for chunk in chunks], False
