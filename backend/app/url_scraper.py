"""Scrapes public Web page titles, OpenGraph metadata, and descriptions from pasted URLs."""
import re
import httpx


def fetch_url_metadata(url: str) -> dict:
    """Fetch metadata (title, description, url) from a web page URL."""
    url_match = re.search(r"https?://[^\s<>\"]+", url)
    if not url_match:
        return {}
    target_url = url_match.group(0).rstrip(".,);")
    try:
        response = httpx.get(
            target_url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) PinapegBot/1.0"},
            timeout=8.0,
            follow_redirects=True,
        )
        response.raise_for_status()
        html = response.text

        # Extract title from og:title or <title>
        title_match = re.search(r'<meta\s+property=["\']og:title["\']\s+content=["\']([^"\']+)["\']', html, re.I)
        if not title_match:
            title_match = re.search(r'<meta\s+name=["\']title["\']\s+content=["\']([^"\']+)["\']', html, re.I)
        if not title_match:
            title_match = re.search(r'<title[^>]*>(.*?)</title>', html, re.I | re.S)
        title = title_match.group(1).strip() if title_match else None
        if title:
            title = re.sub(r"\s+", " ", title)

        # Extract description from og:description or meta description
        desc_match = re.search(r'<meta\s+property=["\']og:description["\']\s+content=["\']([^"\']+)["\']', html, re.I)
        if not desc_match:
            desc_match = re.search(r'<meta\s+name=["\']description["\']\s+content=["\']([^"\']+)["\']', html, re.I)
        description = desc_match.group(1).strip() if desc_match else None
        if description:
            description = re.sub(r"\s+", " ", description)

        return {
            "url": target_url,
            "title": title,
            "description": description,
        }
    except Exception:
        return {"url": target_url}
