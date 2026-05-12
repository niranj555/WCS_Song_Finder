# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Run locally (no Docker):**
```bash
pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...
export APP_USERNAME=yourname
export APP_PASSWORD=yourpassword
export SESSION_SECRET=any-long-random-string
uvicorn main:app --reload
```

**Run with Docker:**
```bash
docker compose up
```

**Run tests:**
```bash
# Inside Docker container
docker exec <container_name> python -m pytest tests/ -v

# Locally
python -m pytest tests/ -v

# Single test
python -m pytest tests/test_recommender.py::TestBuildUserPrompt::test_tempo_in_prompt -v
```

## Required Environment Variables

```
ANTHROPIC_API_KEY=sk-ant-...
APP_USERNAME=yourname
APP_PASSWORD=yourpassword
SESSION_SECRET=any-long-random-string
```

Optional: `DB_PATH` (defaults to `wcs_cache.db` in `config.py`).

## Architecture

**`recommender.py`** — Core AI logic:
- `DescriptorRequest` (Pydantic model): the full set of WCS dance descriptors submitted by the user
- `stream_recommendations()`: async generator that calls Claude with SSE streaming; yields `{"type": "song", "song": {...}}` items and a final `{"type": "done", "curator_note": "..."}` item
- `get_similar_songs()`, `get_djset()`, `get_covers_remixes()`: synchronous Claude calls returning parsed JSON dicts
- SQLite cache in two tables (`cache`, `similar_cache`) keyed by MD5 hash of the request; `db_path` is configurable
- `SYSTEM_PROMPT` and `DJ_SYSTEM_PROMPT`: long system prompts with explicit hallucination-prevention rules baked in; these are central to the product — edit carefully
- `build_user_prompt()`: constructs the per-request user message from descriptor values and label dicts (`PREDICTABILITY_LABELS`, `SHARPNESS_LABELS`, `ELASTICITY_LABELS`, `RISK_LABELS`)

**`main.py`** — FastAPI app:
- Session-based auth via `starlette.middleware.sessions`; credentials compared against `settings.app_username/app_password`
- `/recommend` streams SSE via `StreamingResponse`; all other AI endpoints (`/similar`, `/djset`, `/covers`) return `JSONResponse`
- All AI endpoints return 401 if session is missing

**`static/app.js`** — All frontend logic (no framework):
- SSE consumer for `/recommend` streaming; song cards render one-by-one as events arrive
- Manages playlists, favorites (persisted to `localStorage`), and search history
- Quick presets and DJ Set Builder are implemented here

**`templates/index.html`** — Main app UI shell; `templates/login.html` — login form.

## Key Design Decisions

- **Streaming vs. non-streaming**: `/recommend` uses `stream=True` with Claude's async client; `/similar`, `/djset`, `/covers` use the sync client and wait for the full response before returning
- **Cache**: Identical requests (same descriptors, sorted) are served from SQLite without hitting Claude; the cache has no TTL by default
- **Hallucination prevention**: The system prompts include 8 explicit accuracy rules enforced at the prompt level — this is intentional product design, not boilerplate. Do not simplify or remove these rules
- **Frontend state**: Favorites and history live in `localStorage`; playlists also in `localStorage`. Nothing is persisted server-side beyond the response cache
