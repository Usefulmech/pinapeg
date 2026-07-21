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
    match = re.search(r"arxiv\.org/(?:abs|pdf)/([^/?#]+)", text, re.I)
    return match.group(1).removesuffix(".pdf") if match else None


def _year_from_crossref(work: dict) -> str | None:
    for key in ("published-print", "published-online", "published", "issued"):
        parts = (work.get(key) or {}).get("date-parts") or []
        if parts and parts[0]:
            return str(parts[0][0])
    return None


def fetch_metadata(text: str) -> dict[str, object]:
    """Return only verified public metadata; empty data is an acceptable result."""
    try:
        doi = _doi(text)
        if doi:
            response = httpx.get(f"https://api.crossref.org/works/{doi}", timeout=6.0)
            response.raise_for_status()
            work = response.json()["message"]
            title = _clean((work.get("title") or [None])[0])
            authors = [" ".join(filter(None, (author.get("given"), author.get("family")))) for author in work.get("author", [])]
            return {"url": f"https://doi.org/{doi}", "doi": doi, "title": title, "authors": authors, "published_year": _year_from_crossref(work), "abstract": _clean(work.get("abstract"))}
        arxiv_id = _arxiv_id(text)
        if arxiv_id:
            response = httpx.get(f"https://export.arxiv.org/api/query?id_list={arxiv_id}", timeout=6.0)
            response.raise_for_status()
            root = element_tree.fromstring(response.text)
            atom = "{http://www.w3.org/2005/Atom}"
            entry = root.find(f"{atom}entry")
            if entry is not None:
                published = entry.findtext(f"{atom}published")
                return {"url": f"https://arxiv.org/abs/{arxiv_id}", "arxiv_id": arxiv_id, "published_year": published[:4] if published else None, "title": _clean(entry.findtext(f"{atom}title")), "authors": [_clean(author.findtext(f"{atom}name")) for author in entry.findall(f"{atom}author")], "abstract": _clean(entry.findtext(f"{atom}summary"))}
    except (httpx.HTTPError, KeyError, element_tree.ParseError):
        pass
    return {"url": text.strip()}
