"""Small, failure-tolerant metadata clients for research-paper capture."""
import re
import xml.etree.ElementTree as element_tree
import httpx


def _clean(value: str | None) -> str | None:
    value = re.sub(r"<[^>]+>", " ", value or "")
    return re.sub(r"\s+", " ", value).strip() or None


def _doi(text: str) -> str | None:
    match = re.search(r"(?:doi\.org/)?(10\.\d{4,9}/[-._;()/:a-z0-9]+)", text, re.I)
    return match.group(1).rstrip(".,)") if match else None


def _arxiv_id(text: str) -> str | None:
    match = re.search(r"(?:arxiv\.org/(?:abs|pdf)/|arxiv:)\s*([^/?#\s]+)", text, re.I)
    if not match:
        match = re.search(r"\b(\d{4}\.\d{4,5}(?:v\d+)?)\b", text, re.I)
    return match.group(1).removesuffix(".pdf") if match else None


def _year_from_crossref(work: dict) -> str | None:
    for key in ("published-print", "published-online", "published", "issued"):
        parts = (work.get(key) or {}).get("date-parts") or []
        if parts and parts[0]:
            return str(parts[0][0])
    return None


def _clean_query(text: str) -> str:
    """Strip guided-capture prefixes to get the raw paper title or identifier."""
    return re.sub(
        r"^(?:research paper:|track research paper:|paper to read:|paper:|track paper:)\s*",
        "",
        text,
        flags=re.I,
    ).strip()


def _title_search(query: str) -> dict:
    """Search Crossref by title as fallback when no DOI/arXiv is detected."""
    if len(query) < 8:
        return {}
    try:
        response = httpx.get(
            "https://api.crossref.org/works",
            params={"query.title": query, "rows": 3, "select": "DOI,title,author,abstract,published-print,published-online,issued"},
            timeout=8.0,
        )
        response.raise_for_status()
        items = response.json().get("message", {}).get("items", [])
        if not items:
            return {}
        q_lower = query.lower()
        for work in items:
            title = _clean((work.get("title") or [None])[0])
            if not title:
                continue
            t_lower = title.lower()
            overlap = sum(w in t_lower for w in q_lower.split() if len(w) > 3)

            if overlap == 0:
                continue
            doi = str(work.get("DOI") or "").strip()
            authors = [
                " ".join(filter(None, (a.get("given"), a.get("family"))))
                for a in work.get("author", [])
            ]
            return {
                "url": f"https://doi.org/{doi}" if doi else "",
                "doi": doi or None,
                "title": title,
                "authors": [a for a in authors if a],
                "published_year": _year_from_crossref(work),
                "abstract": _clean(work.get("abstract")),
            }
        return {}
    except (httpx.HTTPError, KeyError, IndexError, ValueError):
        return {}


def fetch_metadata(text: str) -> dict:
    """Return verified public metadata; empty data is an acceptable result."""
    try:
        doi = _doi(text)
        if doi:
            response = httpx.get(f"https://api.crossref.org/works/{doi}", timeout=8.0)
            response.raise_for_status()
            work = response.json()["message"]
            title = _clean((work.get("title") or [None])[0])
            authors = [
                " ".join(filter(None, (a.get("given"), a.get("family"))))
                for a in work.get("author", [])
            ]
            return {
                "url": f"https://doi.org/{doi}",
                "doi": doi,
                "title": title,
                "authors": [a for a in authors if a],
                "published_year": _year_from_crossref(work),
                "abstract": _clean(work.get("abstract")),
            }
        arxiv_id = _arxiv_id(text)
        if arxiv_id:
            response = httpx.get(
                f"https://export.arxiv.org/api/query?id_list={arxiv_id}",
                timeout=8.0,
            )
            response.raise_for_status()
            root = element_tree.fromstring(response.text)
            atom = "{http://www.w3.org/2005/Atom}"
            entry = root.find(f"{atom}entry")
            if entry is not None:
                published = entry.findtext(f"{atom}published")
                authors = [
                    _clean(a.findtext(f"{atom}name"))
                    for a in entry.findall(f"{atom}author")
                ]
                return {
                    "url": f"https://arxiv.org/abs/{arxiv_id}",
                    "arxiv_id": arxiv_id,
                    "published_year": published[:4] if published else None,
                    "title": _clean(entry.findtext(f"{atom}title")),
                    "authors": [a for a in authors if a],
                    "abstract": _clean(entry.findtext(f"{atom}summary")),
                }
    except (httpx.HTTPError, KeyError, element_tree.ParseError):
        pass

    # Fallback: title search via Crossref
    clean_query = _clean_query(text)
    title_result = _title_search(clean_query)
    if title_result.get("title"):
        return title_result

    # Last resort: store the raw input as URL only if it looks like a URL
    raw = text.strip()
    return {"url": raw if raw.startswith("http") else ""}
