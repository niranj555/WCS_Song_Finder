import hashlib
import json
import logging
import sqlite3
import time
import traceback
from typing import AsyncGenerator, List
import anthropic
from pydantic import BaseModel
from config import settings

log = logging.getLogger("wcs.recommender")
client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
async_client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)


# ── SQLite Cache ──────────────────────────────────────────────

def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(settings.db_path)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS cache (
            key TEXT PRIMARY KEY,
            result TEXT NOT NULL,
            created_at INTEGER NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS similar_cache (
            key TEXT PRIMARY KEY,
            result TEXT NOT NULL,
            created_at INTEGER NOT NULL
        )
    """)
    conn.commit()
    return conn


def _cache_get(table: str, key: str) -> dict | None:
    assert table in ("cache", "similar_cache"), f"Invalid table: {table}"
    conn = _get_conn()
    try:
        row = conn.execute(f"SELECT result FROM {table} WHERE key = ?", (key,)).fetchone()
        if row:
            log.debug("Cache hit: table=%s key=%s", table, key)
            return json.loads(row[0])
        return None
    finally:
        conn.close()


def _cache_set(table: str, key: str, value: dict) -> None:
    assert table in ("cache", "similar_cache"), f"Invalid table: {table}"
    conn = _get_conn()
    try:
        conn.execute(
            f"INSERT OR REPLACE INTO {table} (key, result, created_at) VALUES (?, ?, ?)",
            (key, json.dumps(value), int(time.time()))
        )
        conn.commit()
        log.debug("Cache set: table=%s key=%s", table, key)
    finally:
        conn.close()


# ── Cache key ─────────────────────────────────────────────────

def _cache_key(req: "DescriptorRequest") -> str:
    data = {
        "tempo_feel": req.tempo_feel,
        "phrase_predictability": req.phrase_predictability,
        "break_behavior": sorted(req.break_behavior),
        "accent_sharpness": req.accent_sharpness,
        "elasticity_potential": req.elasticity_potential,
        "risk_level": req.risk_level,
        "emotional_tone": sorted(req.emotional_tone),
        "genre": sorted(req.genre),
        "additional_context": req.additional_context.strip().lower(),
    }
    return hashlib.md5(json.dumps(data, sort_keys=True).encode()).hexdigest()


# ── Labels ────────────────────────────────────────────────────

PREDICTABILITY_LABELS = {
    1: "Very predictable (clean 8-counts, textbook phrasing)",
    2: "Mostly predictable with minor surprises",
    3: "Moderate — some unexpected moments",
    4: "Leaning deceptive — fake-outs and delayed resolutions",
    5: "Highly deceptive — irregular phrases, unexpected breaks",
}

SHARPNESS_LABELS = {
    1: "Very smooth — encourages stretch, flow, delayed anchors",
    2: "Mostly smooth with occasional definition",
    3: "Balanced — mix of flow and punch",
    4: "Punchy — rewards hits and stops",
    5: "Very punchy — sharp accents, rhythmic footwork",
}

ELASTICITY_LABELS = {
    1: "Low elasticity — constant pulse, less room to stretch",
    2: "Some stretch potential in the groove",
    3: "Moderate elasticity — rewards timing awareness",
    4: "High elasticity — song breathes, punishes rushing",
    5: "Very high elasticity — maximum stretch reward, patience required",
}

RISK_LABELS = {
    1: "Safe — clean, predictable, beginner-friendly",
    2: "Low risk — mostly predictable with minor gotchas",
    3: "Moderate risk — some irregular moments",
    4: "High risk — deceptive, will expose timing weaknesses",
    5: "Very high risk — irregular breaks, tempo shifts, advanced only",
}


# ── Prompts ───────────────────────────────────────────────────

SYSTEM_PROMPT = """You are a world-class West Coast Swing dance music curator and musicality coach.
You have encyclopedic knowledge of WCS music spanning blues, neo-soul, contemporary pop,
R&B, hip-hop, and everything in between — tracks used in competitions, showcases, and
social dancing around the world.

You understand exactly how musical elements create dance affordances:
- How deceptive phrasing rewards a delayed anchor
- How a punchy accent invites a sharp hit or stop
- How high-elasticity songs punish rushing and reward patience
- How emotional tone shapes connection and partnership expression
- How risk level determines whether a song elevates or exposes a dancer

You speak the language of WCS dancers, not DJs or music producers.
You reference real-world WCS concepts: anchors, triples, sugar pushes, whips,
musicality hits, fake-outs, phrase structure, syncopations.

ACCURACY RULES — follow these strictly before including any song:

1. VERIFY BEFORE YOU WRITE: For each song, silently confirm: "I am certain this exact title was released by this exact artist." If any doubt exists, pick a different song.

2. PREFER WELL-KNOWN TRACKS: Stick to an artist's charted singles, album hits, or songs widely documented in music press. Avoid deep cuts or B-sides unless you are completely certain they exist.

3. NEVER MIX UP SONG TITLES ACROSS ARTISTS: A title that fits an artist's style is not proof they recorded it. "Come and Get It" is Selena Gomez, not Aaliyah. "Greedy" is Tate McRae, not Tame Impala. Always verify the pairing, not just the artist and not just the title.

4. REMIXES AND COVERS ARE WELCOME — BUT MUST BE VERIFIED: Remixes and covers are a core part of WCS culture. Include them when they are a great fit, but only if you can name the specific remixer (e.g. "Kaytranada Remix" — not "Trance Mix" or "Club Mix" with no remixer name) and know where it was released. For covers, only include them if you know the specific release — do not infer a cover exists just because an artist's style suggests they might have recorded it.

5. WHEN IN DOUBT, SWAP THE ARTIST: If you are unsure which song to pick for an artist, choose a completely different artist whose relevant song you are 100% certain about. A confident recommendation from a different artist is always better than a guess.

Return your response as valid JSON only — no markdown, no explanation outside the JSON."""

DJ_SYSTEM_PROMPT = """You are a world-class West Coast Swing DJ with encyclopedic knowledge of WCS music.
You build complete DJ sets with intentional energy arcs — knowing when to open a floor, when to push the peak, when to bring it down for connection, and how to close a set memorably.

You understand WCS dance dynamics completely:
- How song tempo and groove create momentum or intimacy on the floor
- How elasticity and predictability affect floor energy collectively
- How emotional tone shapes the partnership and the crowd
- How to sequence songs so each one serves the arc and flows into the next

ACCURACY RULES — follow these strictly before including any song:

1. VERIFY BEFORE YOU WRITE: For each song, silently confirm: "I am certain this exact title was released by this exact artist." If any doubt exists, pick a different song.

2. PREFER WELL-KNOWN TRACKS: Stick to charted singles and album hits. Avoid deep cuts unless you are completely certain they exist.

3. NEVER MIX UP SONG TITLES ACROSS ARTISTS: A title that fits an artist's style is not proof they recorded it. Always verify the pairing — not just the artist and not just the title.

4. REMIXES AND COVERS ARE WELCOME — BUT MUST BE VERIFIED: Remixes and covers are a core part of WCS culture. Include them when they are a great fit, but only if you can name the specific remixer (e.g. "Kaytranada Remix" — not "Trance Mix" or "Club Mix" with no remixer name) and know where it was released. For covers, only include them if you know the specific release — do not infer a cover exists just because an artist's style suggests they might have recorded it.

5. WHEN IN DOUBT, SWAP THE ARTIST: Choose a different artist whose relevant song you are 100% certain about rather than guess.

Return your response as valid JSON only — no markdown, no explanation outside the JSON."""

SIMILAR_SYSTEM_PROMPT = """You are a world-class West Coast Swing dance music curator.
You have encyclopedic knowledge of WCS music and can identify songs with similar dance qualities.
Given a song, you recommend 5 real songs with similar WCS dance characteristics.

ACCURACY RULES — follow these strictly before including any song:

1. VERIFY BEFORE YOU WRITE: For each song, silently confirm: "I am certain this exact title was released by this exact artist." If any doubt exists, pick a different song.

2. PREFER WELL-KNOWN TRACKS: Stick to charted singles and widely documented album hits. Avoid deep cuts unless you are completely certain they exist.

3. NEVER MIX UP SONG TITLES ACROSS ARTISTS: A title that fits an artist's style is not proof they recorded it. Always verify the pairing — not just the artist and not just the title.

4. REMIXES AND COVERS ARE WELCOME — BUT MUST BE VERIFIED: Remixes and covers are a core part of WCS culture. Include them when they are a great fit, but only if you can name the specific remixer (e.g. "Kaytranada Remix" — not "Trance Mix" or "Club Mix" with no remixer name) and know where it was released. For covers, only include them if you know the specific release — do not infer a cover exists just because an artist's style suggests they might have recorded it.

5. WHEN IN DOUBT, SWAP THE ARTIST: Choose a different artist whose relevant song you are 100% certain about rather than guess.

Return your response as valid JSON only — no markdown, no explanation outside the JSON."""


# ── Request model ─────────────────────────────────────────────

class DescriptorRequest(BaseModel):
    tempo_feel: str  # "Slow" | "Medium" | "Fast"
    phrase_predictability: int  # 1-5
    break_behavior: List[str]
    accent_sharpness: int  # 1-5
    elasticity_potential: int  # 1-5
    risk_level: int  # 1-5
    emotional_tone: List[str]
    genre: List[str] = []  # empty = All genres
    additional_context: str = ""


# ── Prompt builders ───────────────────────────────────────────

def build_user_prompt(req: DescriptorRequest) -> str:
    breaks = ", ".join(req.break_behavior) if req.break_behavior else "not specified"
    tones = ", ".join(req.emotional_tone) if req.emotional_tone else "not specified"
    genre_line = ", ".join(req.genre) if req.genre else "All genres"

    prompt = f"""A West Coast Swing dancer is looking for songs with these characteristics:

TEMPO FEEL: {req.tempo_feel}
PHRASE PREDICTABILITY: {req.phrase_predictability}/5 — {PREDICTABILITY_LABELS[req.phrase_predictability]}
BREAK BEHAVIOR: {breaks}
ACCENT SHARPNESS: {req.accent_sharpness}/5 — {SHARPNESS_LABELS[req.accent_sharpness]}
ELASTICITY POTENTIAL: {req.elasticity_potential}/5 — {ELASTICITY_LABELS[req.elasticity_potential]}
RISK LEVEL: {req.risk_level}/5 — {RISK_LABELS[req.risk_level]}
EMOTIONAL TONE: {tones}
PREFERRED GENRE: {genre_line}

DIVERSITY RULES (strictly enforced):
- No two songs by the same artist
- If specific genres are listed, all 5 songs must come from those genres"""

    if req.additional_context.strip():
        prompt += f"\n\nADDITIONAL CONTEXT: {req.additional_context.strip()}"

    prompt += """

Recommend exactly 5 real songs that match these dance descriptors. Return ONLY this JSON structure:

{
  "recommendations": [
    {
      "title": "Exact song title",
      "artist": "Exact artist name",
      "why_it_fits": "2-3 sentences explaining why this song matches the requested descriptors, using WCS dance language. Reference specific musical moments.",
      "dance_notes": "1-2 sentences with a specific musicality tip for dancing WCS to this song — what to listen for, what to do.",
      "suggested_patterns": ["pattern or move 1", "pattern or move 2", "pattern or move 3"],
      "competition_history": "If this song has been used in notable WCS competitions or by known pros, mention it briefly. Otherwise empty string.",
      "listen_query": "Artist Name - Song Title"
    }
  ],
  "curator_note": "1-2 sentences summing up what makes this song selection cohesive or what the dancer should know about this set."
}

All 5 recommendations must be real songs. Vary the artists. Think across genres that work for WCS.
Remixes and covers are a core part of WCS culture — actively include them when they fit. Well-known remixes (e.g. Kaytranada, Disclosure, Sweater Beats) and covers of classic songs by different artists add great variety. Only include remixes or covers you are confident actually exist."""

    return prompt


def build_djset_prompt(req: DescriptorRequest) -> str:
    breaks = ", ".join(req.break_behavior) if req.break_behavior else "not specified"
    tones = ", ".join(req.emotional_tone) if req.emotional_tone else "not specified"
    genre_line = ", ".join(req.genre) if req.genre else "All genres"

    return f"""Build a 7-song DJ set for West Coast Swing with this overall vibe and energy profile:

TEMPO FEEL: {req.tempo_feel}
PHRASE PREDICTABILITY: {req.phrase_predictability}/5 — {PREDICTABILITY_LABELS[req.phrase_predictability]}
BREAK BEHAVIOR: {breaks}
ACCENT SHARPNESS: {req.accent_sharpness}/5 — {SHARPNESS_LABELS[req.accent_sharpness]}
ELASTICITY POTENTIAL: {req.elasticity_potential}/5 — {ELASTICITY_LABELS[req.elasticity_potential]}
RISK LEVEL: {req.risk_level}/5 — {RISK_LABELS[req.risk_level]}
EMOTIONAL TONE: {tones}
PREFERRED GENRE: {genre_line}

Build a 7-song set that follows this energy arc in order:
1. Opener — accessible, inviting, sets the mood without overwhelming
2. Early Build — slightly more energy, dancers are warming up
3. Mid-Set — the groove is established, floor is fully moving
4. Peak — the climax of the set, maximum energy and impact
5. Cool-Down — bring it back, connection and intimacy focus
6. Late Night — deep groove, intimate, rewards patient dancers
7. Closer — memorable, satisfying resolution that sends everyone off happy

DIVERSITY RULES (strictly enforced):
- No two songs by the same artist
- If specific genres are listed, all 7 songs must come from those genres

Return ONLY this JSON structure:

{{
  "set": [
    {{
      "title": "Exact song title",
      "artist": "Exact artist name",
      "energy_label": "Opener",
      "why_it_fits": "2-3 sentences explaining why this song works at this arc position in WCS dance terms.",
      "dance_notes": "1-2 sentences with a specific WCS musicality tip for this song.",
      "suggested_patterns": ["pattern 1", "pattern 2", "pattern 3"],
      "listen_query": "Artist Name - Song Title"
    }}
  ],
  "curator_note": "1-2 sentences about what makes this set work as a cohesive arc for WCS dancing."
}}

All 7 songs must be real. The arc should feel intentional and flow naturally from song to song.
Remixes and covers are a core part of WCS culture — actively include them when they serve the arc. Well-known remixes (e.g. Kaytranada, Disclosure, Sweater Beats) and covers by different artists add great variety to a set. Only include remixes or covers you are confident actually exist."""


# ── Streaming recommendations ─────────────────────────────────

async def stream_recommendations(req: DescriptorRequest) -> AsyncGenerator[dict, None]:
    """Async generator yielding song dicts as they stream from Claude, then a done event."""
    key = _cache_key(req)
    cached = _cache_get("cache", key)
    if cached:
        log.info("Cache hit — streaming cached songs")
        for song in cached.get("recommendations", []):
            yield {"type": "song", "song": song}
        yield {"type": "done", "curator_note": cached.get("curator_note", "")}
        return

    prompt = build_user_prompt(req)
    log.info("Calling Claude claude-sonnet-4-6 (SSE streaming)…")

    full_text = ""
    in_string = False
    escape_next = False
    depth = 0
    in_recommendations = False
    obj_start = -1

    try:
        async with async_client.messages.stream(
            model="claude-sonnet-4-6",
            max_tokens=4000,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        ) as stream:
            async for chunk in stream.text_stream:
                chunk_start = len(full_text)
                full_text += chunk

                for ci, char in enumerate(chunk):
                    gpos = chunk_start + ci  # global position in full_text

                    if escape_next:
                        escape_next = False
                        continue
                    if char == "\\" and in_string:
                        escape_next = True
                        continue
                    if char == '"':
                        in_string = not in_string
                        continue
                    if in_string:
                        continue

                    if char == "{":
                        depth += 1
                        if in_recommendations and depth == 2:
                            obj_start = gpos
                    elif char == "}":
                        if in_recommendations and depth == 2 and obj_start != -1:
                            obj_str = full_text[obj_start:gpos + 1]
                            try:
                                song = json.loads(obj_str)
                                log.debug("Streamed song: %s by %s", song.get("title"), song.get("artist"))
                                yield {"type": "song", "song": song}
                            except json.JSONDecodeError:
                                log.warning("Failed to parse streamed song object")
                            obj_start = -1
                        depth -= 1
                    elif char == "[" and depth == 1:
                        in_recommendations = True
                    elif char == "]" and depth == 1 and in_recommendations:
                        in_recommendations = False

            final = await stream.get_final_message()
            log.info(
                "Claude finished | stop_reason=%s input_tokens=%s output_tokens=%s",
                final.stop_reason,
                final.usage.input_tokens,
                final.usage.output_tokens,
            )

    except Exception:
        log.error("Error streaming from Claude:\n%s", traceback.format_exc())
        raise

    # Parse full response for curator_note and to cache
    raw = full_text.strip()
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.rsplit("```", 1)[0].strip()

    try:
        result = json.loads(raw)
        _cache_set("cache", key, result)
        yield {"type": "done", "curator_note": result.get("curator_note", "")}
    except json.JSONDecodeError:
        log.error("Failed to parse full Claude JSON. Raw:\n%s", raw[:500])
        yield {"type": "done", "curator_note": ""}


# ── DJ Set ────────────────────────────────────────────────────

def get_djset(req: DescriptorRequest) -> dict:
    key = "djset_" + _cache_key(req)
    cached = _cache_get("cache", key)
    if cached:
        log.info("DJ set cache hit")
        return cached

    prompt = build_djset_prompt(req)
    log.info("Calling Claude for DJ set…")
    try:
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=6000,
            system=DJ_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )
    except anthropic.APIStatusError as e:
        log.error("Anthropic API error %s: %s", e.status_code, e.message)
        raise
    except anthropic.APIConnectionError as e:
        log.error("Anthropic connection error: %s", e)
        raise
    except Exception:
        log.error("Unexpected error calling Claude:\n%s", traceback.format_exc())
        raise

    log.info(
        "Claude finished DJ set | stop_reason=%s input_tokens=%s output_tokens=%s",
        response.stop_reason,
        response.usage.input_tokens,
        response.usage.output_tokens,
    )

    raw_text = ""
    for block in response.content:
        if block.type == "text":
            raw_text = block.text
            break

    if not raw_text:
        raise ValueError("Claude returned no text content")

    raw_text = raw_text.strip()
    if raw_text.startswith("```"):
        raw_text = raw_text.split("```", 2)[1]
        if raw_text.startswith("json"):
            raw_text = raw_text[4:]
        raw_text = raw_text.rsplit("```", 1)[0].strip()

    try:
        result = json.loads(raw_text)
        _cache_set("cache", key, result)
        return result
    except json.JSONDecodeError:
        log.error("Failed to parse DJ set JSON:\n%s", raw_text[:500])
        raise


# ── Covers & Remixes ─────────────────────────────────────────

COVERS_REMIXES_SYSTEM_PROMPT = """You are a world-class West Coast Swing dance music curator specializing in remixes and covers.
You have deep knowledge of the WCS remix and cover landscape — producer remixes, live covers, re-recordings, and tribute versions that became WCS staples.

You understand how a great remix or cover changes the dance feel of a song:
- A slower remix opens up elasticity and stretch that the original didn't have
- A funkier remix adds groove and swing that changes what the music asks for
- A cover reinterprets the emotional tone, sometimes making a dark song playful or vice versa
- A stripped-down acoustic cover creates intimacy and connection opportunities

ACCURACY RULES — these are strict, not suggestions:

1. KNOW THE RELEASE, NOT JUST THE VIBE: Before including anything, you must be able to state — even silently — WHERE this remix or cover was released: an album name, a remix EP, a film soundtrack, a specific single release. "This artist does covers, so they probably covered this" is not enough. "This sounds like a remix that could exist" is not enough.

2. COVERS — THE ARTIST MUST HAVE ACTUALLY RECORDED IT: Do not infer covers from an artist's style or genre. Esperanza Spalding doing jazz covers does NOT mean she recorded Strange Fruit. Nina Simone's vast catalog does NOT mean she recorded every standard. Only include a cover if you know the specific release where it appeared.

3. REMIXES — NAME THE REMIXER, NOT JUST THE STYLE: Every remix must have a specific named producer or remixer (e.g. "Kaytranada Remix", "Dave Audé Remix", "Todd Terry Remix"). A vague style descriptor like "Trance Mix", "Club Mix", or "Extended Mix" with no named remixer is a hallucination. Do not include it.

4. WHEN IN DOUBT, PICK A DIFFERENT SONG ENTIRELY: If you are not sure a specific remix or cover exists, do not try to find a close substitute — choose a completely different, well-documented remix or cover by a different artist. Confidence comes first.

Return your response as valid JSON only — no markdown, no explanation outside the JSON."""


def build_covers_remixes_prompt(req: DescriptorRequest) -> str:
    breaks = ", ".join(req.break_behavior) if req.break_behavior else "not specified"
    tones = ", ".join(req.emotional_tone) if req.emotional_tone else "not specified"
    genre_line = ", ".join(req.genre) if req.genre else "All genres"

    return f"""A West Coast Swing dancer wants ONLY remixes and covers — no original recordings — that match this vibe:

TEMPO FEEL: {req.tempo_feel}
PHRASE PREDICTABILITY: {req.phrase_predictability}/5 — {PREDICTABILITY_LABELS[req.phrase_predictability]}
BREAK BEHAVIOR: {breaks}
ACCENT SHARPNESS: {req.accent_sharpness}/5 — {SHARPNESS_LABELS[req.accent_sharpness]}
ELASTICITY POTENTIAL: {req.elasticity_potential}/5 — {ELASTICITY_LABELS[req.elasticity_potential]}
RISK LEVEL: {req.risk_level}/5 — {RISK_LABELS[req.risk_level]}
EMOTIONAL TONE: {tones}
PREFERRED GENRE: {genre_line}

Recommend exactly 5 remixes or covers. Every single entry must be either:
- A REMIX: an official remix of an existing song by a named producer or artist
- A COVER: a real recording of a song originally by a different artist

No original recordings. Mix remixes and covers freely.

Return ONLY this JSON structure:

{{
  "recommendations": [
    {{
      "title": "Exact title (e.g. 'Crazy in Love (Fifty Shades Remix)' or 'At Last' if it's a cover)",
      "artist": "The remixer or covering artist (not the original artist)",
      "type": "remix or cover",
      "original_title": "Original song title",
      "original_artist": "Original song artist",
      "why_it_fits": "2-3 sentences explaining why this remix or cover works for WCS dancing at this vibe, and how it differs from the original.",
      "dance_notes": "1-2 sentences with a specific WCS musicality tip for this version.",
      "suggested_patterns": ["pattern 1", "pattern 2", "pattern 3"],
      "competition_history": "If this version has been used in notable WCS competitions or by known pros, mention it. Otherwise empty string.",
      "listen_query": "Artist Name - Song Title"
    }}
  ],
  "curator_note": "1-2 sentences about what makes this remix and cover selection special for WCS dancing."
}}

All 5 must be real, verified remixes or covers. Vary the artists and remixers."""


def get_covers_remixes(req: DescriptorRequest) -> dict:
    key = "covers_" + _cache_key(req)
    cached = _cache_get("cache", key)
    if cached:
        log.info("Covers/remixes cache hit")
        return cached

    prompt = build_covers_remixes_prompt(req)
    log.info("Calling Claude for covers & remixes…")
    try:
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4000,
            system=COVERS_REMIXES_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )
    except anthropic.APIStatusError as e:
        log.error("Anthropic API error %s: %s", e.status_code, e.message)
        raise
    except anthropic.APIConnectionError as e:
        log.error("Anthropic connection error: %s", e)
        raise
    except Exception:
        log.error("Unexpected error calling Claude:\n%s", traceback.format_exc())
        raise

    log.info(
        "Claude finished covers/remixes | stop_reason=%s input_tokens=%s output_tokens=%s",
        response.stop_reason,
        response.usage.input_tokens,
        response.usage.output_tokens,
    )

    raw_text = ""
    for block in response.content:
        if block.type == "text":
            raw_text = block.text
            break

    if not raw_text:
        raise ValueError("Claude returned no text content")

    raw_text = raw_text.strip()
    if raw_text.startswith("```"):
        raw_text = raw_text.split("```", 2)[1]
        if raw_text.startswith("json"):
            raw_text = raw_text[4:]
        raw_text = raw_text.rsplit("```", 1)[0].strip()

    try:
        result = json.loads(raw_text)
        _cache_set("cache", key, result)
        return result
    except json.JSONDecodeError:
        log.error("Failed to parse covers/remixes JSON:\n%s", raw_text[:500])
        raise


# ── Similar songs ─────────────────────────────────────────────

def get_similar_songs(title: str, artist: str) -> dict:
    key = hashlib.md5(f"{title.lower()}|{artist.lower()}".encode()).hexdigest()
    cached = _cache_get("similar_cache", key)
    if cached:
        log.info("Similar cache hit — returning cached result")
        return cached

    prompt = f"""A West Coast Swing dancer wants to find songs similar to:
Title: {title}
Artist: {artist}

Recommend exactly 5 real songs that have similar WCS dance qualities — similar tempo feel, groove, elasticity, emotional character, and competitive/social dance context.
Return ONLY this JSON structure:

{{
  "recommendations": [
    {{
      "title": "Exact song title",
      "artist": "Exact artist name",
      "why_it_fits": "2-3 sentences explaining why this song is similar in WCS dance terms.",
      "dance_notes": "1-2 sentences with a specific musicality tip for dancing WCS to this song.",
      "suggested_patterns": ["pattern or move 1", "pattern or move 2", "pattern or move 3"],
      "competition_history": "If this song has been used in notable WCS competitions or by known pros, mention it briefly. Otherwise empty string.",
      "listen_query": "Artist Name - Song Title"
    }}
  ],
  "curator_note": "1-2 sentences about why these songs share DNA with {title} by {artist} for WCS dancing."
}}

All 5 recommendations must be real songs. Vary the artists."""

    log.info("Calling Claude for similar songs to '%s' by '%s'…", title, artist)
    try:
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4000,
            system=SIMILAR_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )
    except anthropic.APIStatusError as e:
        log.error("Anthropic API error %s: %s", e.status_code, e.message)
        raise
    except anthropic.APIConnectionError as e:
        log.error("Anthropic connection error: %s", e)
        raise
    except Exception:
        log.error("Unexpected error calling Claude:\n%s", traceback.format_exc())
        raise

    log.info(
        "Claude finished similar | stop_reason=%s input_tokens=%s output_tokens=%s",
        response.stop_reason,
        response.usage.input_tokens,
        response.usage.output_tokens,
    )

    raw_text = ""
    for block in response.content:
        if block.type == "text":
            raw_text = block.text
            break

    if not raw_text:
        raise ValueError("Claude returned no text content")

    raw_text = raw_text.strip()
    if raw_text.startswith("```"):
        raw_text = raw_text.split("```", 2)[1]
        if raw_text.startswith("json"):
            raw_text = raw_text[4:]
        raw_text = raw_text.rsplit("```", 1)[0].strip()

    try:
        result = json.loads(raw_text)
        _cache_set("similar_cache", key, result)
        log.info("Cached similar result")
        return result
    except json.JSONDecodeError:
        log.error("Failed to parse JSON for similar songs:\n%s", raw_text[:500])
        raise
