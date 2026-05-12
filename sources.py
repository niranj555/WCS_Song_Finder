import logging
import re
import sqlite3
import time

import httpx
from bs4 import BeautifulSoup

from config import settings

_STRIP_ANNOTATIONS = re.compile(
    r'\s*\((Clean|Clean Version|Clean Edit|Explicit|Radio Edit|Radio Version|'
    r'Album Version|Single Version|Skip Intro|skip intro)\)',
    re.IGNORECASE,
)

log = logging.getLogger("wcs.sources")

_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; WCSRecommender/1.0)"}
_SEPARATORS = [" – ", "–", " — ", "—", " - "]

WP_POSTS_API = "https://proswingdjs.com/wp-json/wp/v2/posts"
WP_PAGES_API = "https://proswingdjs.com/wp-json/wp/v2/pages"

# WordPress page slugs to scrape via Pages API
STATIC_PAGE_SLUGS = {
    "top-songs-of-the-year": "top_of_year",
    "global-swing-djs-archives": "global_archives",
    "dj-favorites": "dj_favorites",
    "dj-favorites-alt": "dj_favorites",
}

# Member pages with song picks
MEMBER_PAGE_SLUGS = [
    "koichi-tsunoda", "ruby-lair",
]


def _client() -> httpx.Client:
    return httpx.Client(timeout=30, follow_redirects=True, headers=_HEADERS)


def _clean_title(title: str) -> str:
    return _STRIP_ANNOTATIONS.sub("", title).strip()


def _parse_dash(text: str) -> tuple[str, str] | None:
    """Parse 'Title – Artist' (any dash variant). Returns (title, artist) or None."""
    text = re.sub(r"^\d+[\.\)]\s*", "", text.strip())
    for sep in _SEPARATORS:
        if sep in text:
            title, _, artist = text.partition(sep)
            title = _clean_title(title.strip().lstrip("•").strip())
            artist = artist.strip()
            if 2 < len(title) < 150 and 1 < len(artist) < 150:
                return title, artist
            break
    return None


def _parse_colon(text: str) -> tuple[str, str] | None:
    """Parse 'Title: Artist' format used in blues/DJ favorites lists."""
    text = text.strip()
    if ": " in text:
        title, _, artist = text.partition(": ")
        title = _clean_title(title.strip())
        artist = artist.strip()
        if 2 < len(title) < 150 and 1 < len(artist) < 150:
            return title, artist
    return None


def _extract_from_soup(soup: BeautifulSoup, source: str) -> list[dict]:
    """Extract songs from parsed HTML, handling multiple formats."""
    songs: list[dict] = []
    seen: set[tuple] = set()

    def add(title: str, artist: str) -> None:
        key = (title.lower(), artist.lower())
        if key not in seen:
            seen.add(key)
            songs.append({"title": title, "artist": artist, "source": source})

    # 1. <li> tags — try dash first, then colon
    for li in soup.find_all("li"):
        text = li.get_text(separator=" ", strip=True)
        parsed = _parse_dash(text) or _parse_colon(text)
        if parsed:
            add(*parsed)

    # 2. <p> tags — handle packed formats
    for p in soup.find_all("p"):
        raw = p.get_text(strip=True)

        # Bullet-separated: "•Title – Artist•Title – Artist"
        if "•" in raw:
            for segment in raw.split("•"):
                parsed = _parse_dash(segment.strip())
                if parsed:
                    add(*parsed)
            continue

        # Packed numbered: "1.Title – Artist2.Title – Artist..."
        # Split on number+dot boundaries that precede a capital or known pattern
        segments = re.split(r"(?<!\d)(\d{1,2})\.", raw)
        if len(segments) > 3:
            for seg in segments:
                parsed = _parse_dash(seg.strip())
                if parsed:
                    add(*parsed)
            continue

        # Plain paragraph with dash
        parsed = _parse_dash(raw)
        if parsed:
            add(*parsed)

    return songs


def scrape_wp_posts() -> list[dict]:
    """Fetch all WCS posts via WordPress REST API and parse songs from <p> tags."""
    songs: list[dict] = []
    seen: set[tuple] = set()

    with _client() as client:
        page = 1
        while True:
            r = client.get(WP_POSTS_API, params={"per_page": 100, "page": page, "_fields": "content"})
            if r.status_code != 200:
                break
            posts = r.json()
            if not posts:
                break
            for post in posts:
                content = post.get("content", {}).get("rendered", "")
                soup = BeautifulSoup(content, "html.parser")
                for entry in _extract_from_soup(soup, "psdj_posts"):
                    key = (entry["title"].lower(), entry["artist"].lower())
                    if key not in seen:
                        seen.add(key)
                        songs.append(entry)
            total_pages = int(r.headers.get("X-WP-TotalPages", 1))
            if page >= total_pages:
                break
            page += 1

    log.info("scrape_wp_posts: %d songs", len(songs))
    return songs


def scrape_wp_pages() -> list[dict]:
    """Fetch static pages and member pages via WP Pages API."""
    all_slugs = list(STATIC_PAGE_SLUGS.keys()) + MEMBER_PAGE_SLUGS
    songs: list[dict] = []
    seen: set[tuple] = set()

    with _client() as client:
        r = client.get(
            WP_PAGES_API,
            params={"slug": ",".join(all_slugs), "per_page": 100, "_fields": "slug,content"},
        )
        if r.status_code != 200:
            log.error("Pages API returned %d", r.status_code)
            return songs
        pages = r.json()

    for page in pages:
        slug = page["slug"]
        source = STATIC_PAGE_SLUGS.get(slug, slug.replace("-", "_"))
        soup = BeautifulSoup(page["content"]["rendered"], "html.parser")
        for entry in _extract_from_soup(soup, source):
            key = (entry["title"].lower(), entry["artist"].lower())
            if key not in seen:
                seen.add(key)
                songs.append(entry)
        count = sum(1 for s in songs if s["source"] == source)
        log.info("scrape_wp_pages %s (%s): %d songs", slug, source, count)

    log.info("scrape_wp_pages total: %d songs", len(songs))
    return songs


def _store(songs: list[dict]) -> int:
    if not songs:
        return 0
    conn = sqlite3.connect(settings.db_path)
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS wcs_songs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                artist TEXT NOT NULL,
                source TEXT NOT NULL,
                fetched_at INTEGER NOT NULL,
                UNIQUE(title, artist) ON CONFLICT IGNORE
            )
        """)
        now = int(time.time())
        added = 0
        for s in songs:
            cur = conn.execute(
                "INSERT OR IGNORE INTO wcs_songs (title, artist, source, fetched_at) VALUES (?, ?, ?, ?)",
                (s["title"], s["artist"], s["source"], now),
            )
            added += cur.rowcount
        conn.commit()
        return added
    finally:
        conn.close()


def refresh_all_sources() -> dict:
    all_songs: list[dict] = []
    # Pages first so global_archives / dj_favorites get correct source labels;
    # posts fill in the rest (monthly top-10s and DJ pick posts).
    all_songs.extend(scrape_wp_pages())
    all_songs.extend(scrape_wp_posts())

    added = _store(all_songs)

    try:
        conn = sqlite3.connect(settings.db_path)
        total = conn.execute("SELECT COUNT(*) FROM wcs_songs").fetchone()[0]
        by_source = dict(conn.execute(
            "SELECT source, COUNT(*) FROM wcs_songs GROUP BY source"
        ).fetchall())
        conn.close()
    except Exception:
        total, by_source = 0, {}

    log.info("refresh complete: added=%d total=%d by_source=%s", added, total, by_source)
    return {"added": added, "total": total, "by_source": by_source}


def wcs_songs_count() -> int:
    try:
        conn = sqlite3.connect(settings.db_path)
        count = conn.execute("SELECT COUNT(*) FROM wcs_songs").fetchone()[0]
        conn.close()
        return count
    except Exception:
        return 0
