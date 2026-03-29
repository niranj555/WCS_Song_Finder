import hashlib
import json
import logging
import traceback
from typing import List
import anthropic
from pydantic import BaseModel

log = logging.getLogger("wcs.recommender")
client = anthropic.Anthropic()

_cache: dict[str, dict] = {}
_similar_cache: dict[str, dict] = {}


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

CRITICAL: Always recommend real, existing songs by real artists. Never invent songs.

Common mistakes you must avoid:
- Attributing a real song to the wrong artist (e.g. listing a Tate McRae song under Tame Impala)
- Inventing remix or mix names that do not exist (e.g. fabricating a "Darkside Mix" of a real song) — remixes by real artists are welcome and encouraged, but only if the remix actually exists and was officially released
- Combining a real artist name with a song title they never recorded
- Listing a song that sounds plausible for an artist's style but was never actually released

If you are not certain a specific song exists and was recorded by that specific artist, do not include it. Choose a different song you are confident about instead.

Return your response as valid JSON only — no markdown, no explanation outside the JSON."""


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

All 5 recommendations must be real songs. Vary the artists. Think across genres that work for WCS."""

    return prompt


def get_recommendations(req: DescriptorRequest) -> dict:
    key = _cache_key(req)
    if key in _cache:
        log.info("Cache hit — returning cached result")
        return _cache[key]

    prompt = build_user_prompt(req)
    log.debug("User prompt:\n%s", prompt)

    log.info("Calling Claude claude-sonnet-4-6…")
    try:
        with client.messages.stream(
            model="claude-sonnet-4-6",
            max_tokens=4000,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        ) as stream:
            final = stream.get_final_message()
    except anthropic.APIStatusError as e:
        log.error("Anthropic API error %s: %s", e.status_code, e.message)
        raise
    except anthropic.APIConnectionError as e:
        log.error("Anthropic connection error: %s", e)
        raise
    except Exception as e:
        log.error("Unexpected error calling Claude:\n%s", traceback.format_exc())
        raise

    log.info(
        "Claude finished | stop_reason=%s input_tokens=%s output_tokens=%s",
        final.stop_reason,
        final.usage.input_tokens,
        final.usage.output_tokens,
    )

    raw_text = ""
    for block in final.content:
        if block.type == "text":
            raw_text = block.text
            break

    if not raw_text:
        log.error("Claude returned no text block. Full content: %s", final.content)
        raise ValueError("Claude returned no text content")

    log.debug("Raw Claude text:\n%s", raw_text[:500])

    # Strip any accidental markdown fences
    raw_text = raw_text.strip()
    if raw_text.startswith("```"):
        raw_text = raw_text.split("```", 2)[1]
        if raw_text.startswith("json"):
            raw_text = raw_text[4:]
        raw_text = raw_text.rsplit("```", 1)[0].strip()

    try:
        result = json.loads(raw_text)
        _cache[key] = result
        log.info("Cached result (cache size: %d)", len(_cache))
        return result
    except json.JSONDecodeError:
        log.error("Failed to parse JSON. Raw text was:\n%s", raw_text)
        raise


SIMILAR_SYSTEM_PROMPT = """You are a world-class West Coast Swing dance music curator.
You have encyclopedic knowledge of WCS music and can identify songs with similar dance qualities.
Given a song, you recommend 5 real songs with similar WCS dance characteristics.
CRITICAL: Always recommend real, existing songs by real artists. Never invent songs.

Common mistakes you must avoid:
- Attributing a real song to the wrong artist (e.g. listing a Tate McRae song under Tame Impala)
- Inventing remix or mix names that do not exist (e.g. fabricating a "Darkside Mix" of a real song). Remixes by real artists are welcome and encouraged, but only if the remix actually exists
- Combining a real artist name with a song title they never recorded

If you are not certain a specific song exists and was recorded by that specific artist, do not include it. Choose a different song you are confident about instead.

Return your response as valid JSON only — no markdown, no explanation outside the JSON."""


def get_similar_songs(title: str, artist: str) -> dict:
    key = hashlib.md5(f"{title.lower()}|{artist.lower()}".encode()).hexdigest()
    if key in _similar_cache:
        log.info("Similar cache hit — returning cached result")
        return _similar_cache[key]

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
    except Exception as e:
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
        log.error("Claude returned no text block. Full content: %s", response.content)
        raise ValueError("Claude returned no text content")

    raw_text = raw_text.strip()
    if raw_text.startswith("```"):
        raw_text = raw_text.split("```", 2)[1]
        if raw_text.startswith("json"):
            raw_text = raw_text[4:]
        raw_text = raw_text.rsplit("```", 1)[0].strip()

    try:
        result = json.loads(raw_text)
        _similar_cache[key] = result
        log.info("Cached similar result (cache size: %d)", len(_similar_cache))
        return result
    except json.JSONDecodeError:
        log.error("Failed to parse JSON for similar songs. Raw text was:\n%s", raw_text)
        raise
