# WCS Song Finder

An AI-powered song recommendation tool for West Coast Swing dancers. Describe the feel of the music you want to dance to — and Claude curates real songs, remixes, and covers that match your WCS musicality goals.

![WCS Song Finder](https://img.shields.io/badge/Powered%20by-Claude%20Sonnet%204.6-7c3aed?style=flat-square)
![Python](https://img.shields.io/badge/Python-3.11-blue?style=flat-square)
![FastAPI](https://img.shields.io/badge/FastAPI-latest-009688?style=flat-square)

## What It Does

Standard music apps filter by genre and BPM. This app speaks the language of WCS dancers:

- **Genre** — Neo-Soul, R&B, Blues, Pop, Hip-Hop, Jazz, Country, Electronic, Latin, or All
- **Emotional Tone** — Playful, Soulful, Aggressive, Romantic, Dark, Light, Triumphant, Nostalgic, Cinematic, Hypnotic (pick up to 3)
- **Tempo Feel** — Slow / Medium / Fast (how it *dances*, not just the BPM)
- **Phrase Predictability** — Clean 8-counts vs deceptive fake-outs (1–5)
- **Break Behavior** — Clear breaks, fake breaks, micro-pauses, sustained silence
- **Accent Sharpness** — Smooth & legato vs punchy & staccato (1–5)
- **Elasticity Potential** — How much the song rewards stretch and delay (1–5)
- **Risk Level** — Safe for prelims vs high-risk showcase material (1–5)

Claude returns 5 real songs with WCS-specific dance notes, suggested patterns, competition history, and direct search links. Remixes and covers are actively included — they're a core part of WCS culture. Hallucination prevention is built into every prompt: Claude must know the specific release context before including any song, remix, or cover.

## Features

- **Quick Presets** — One-click setups for common WCS scenarios: Late Night Social, Showcase, Showcase Closer, Musicality Drill, Improv Night, Beginner Class
- **DJ Set Builder** — Build a full 7-song set with an intentional energy arc (Opener → Early Build → Mid-Set → Peak → Cool-Down → Late Night → Closer), each song labeled with its arc position
- **Covers & Remixes** — Dedicated search that returns only remixes and covers; each card shows the type badge (REMIX / COVER) and the original artist and title
- **Streaming results** — Song cards appear one by one as Claude generates them, no waiting for all 5
- **Find Similar** — Click any song to get 5 songs with similar WCS dance qualities
- **Playlists** — Create multiple named playlists, add songs with +, rename, copy to clipboard, or clear
- **Favorites** — Heart songs to save them across sessions
- **History** — Full search history with all descriptor settings shown; replay any past search instantly
- **Dark / Light theme** — Toggle between neon dark and light smoke themes
- **Persistent cache** — Identical searches served instantly from SQLite, survives restarts
- **Login-protected** — Simple session auth; invite-only for demos

## Tech Stack

- **Backend**: Python + FastAPI
- **AI**: Claude Sonnet 4.6 (Anthropic) with SSE streaming
- **Frontend**: Vanilla HTML/CSS/JS — no frameworks
- **Cache**: SQLite (stdlib) — persists across restarts
- **Config**: Pydantic Settings
- **Auth**: Session-based with `starlette.middleware.sessions`
- **Tests**: pytest — 27 unit tests covering prompts, cache, and JSON parsing
- **Deployment**: Docker + docker-compose

## Getting Started

### Prerequisites

- Docker + Docker Compose
- An [Anthropic API key](https://console.anthropic.com/) with credits

### Setup

1. **Clone the repo**
   ```bash
   git clone https://github.com/YOUR_USERNAME/wcs-song-finder.git
   cd wcs-song-finder
   ```

2. **Create your `.env` file**
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   APP_USERNAME=yourname
   APP_PASSWORD=yourpassword
   SESSION_SECRET=any-long-random-string
   ```

3. **Run**
   ```bash
   docker compose up
   ```

4. **Open** `http://localhost:8000` and log in

### Run Tests

```bash
docker exec <container_name> python -m pytest tests/ -v
```

### Without Docker

```bash
pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...
export APP_USERNAME=yourname
export APP_PASSWORD=yourpassword
export SESSION_SECRET=any-long-random-string
uvicorn main:app --reload
```

## Deploying to Railway

1. Push to a GitHub repo (`.env` is gitignored — secrets stay local)
2. Create a new project on [railway.app](https://railway.app) from the GitHub repo
3. Add environment variables in the Railway dashboard:
   - `ANTHROPIC_API_KEY`
   - `APP_USERNAME`
   - `APP_PASSWORD`
   - `SESSION_SECRET`
4. Railway auto-builds from the Dockerfile and provides a public URL

## Project Structure

```
wcs-song-finder/
├── main.py              # FastAPI app, routes, SSE streaming, auth
├── recommender.py       # Claude API, prompt engineering, SQLite cache, DJ set
├── config.py            # Pydantic Settings
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── tests/
│   └── test_recommender.py  # 27 unit tests
├── templates/
│   ├── index.html       # Main app UI
│   └── login.html       # Login page
└── static/
    ├── style.css        # Dark/light theme, neon accents
    └── app.js           # Presets, SSE streaming, DJ set, playlists, history, favorites
```

## API

### `POST /recommend`

Streams results via Server-Sent Events. Songs appear as they are generated.

```json
{
  "tempo_feel": "Medium",
  "phrase_predictability": 3,
  "break_behavior": ["Clear breaks", "Micro-pauses"],
  "accent_sharpness": 2,
  "elasticity_potential": 4,
  "risk_level": 2,
  "emotional_tone": ["Soulful", "Romantic"],
  "genre": ["Neo-Soul", "R&B"]
}
```

Returns SSE stream of song objects, then a `done` event with `curator_note`.

### `POST /similar`

```json
{ "title": "Leave the Door Open", "artist": "Silk Sonic" }
```

Returns 5 songs with similar WCS dance qualities.

### `POST /djset`

Same body as `/recommend`. Returns a 7-song set with energy arc labels.

### `POST /covers`

Same body as `/recommend`. Returns 5 remixes or covers only — no original recordings. Each entry includes `type` (remix/cover), `original_title`, and `original_artist`.

## Notes

- First request calls Claude Sonnet 4.6 — takes ~5–15 seconds; `/recommend` streams as it generates
- Repeated identical searches served from SQLite cache instantly
- API costs roughly $0.02–0.05 per recommendation set, ~$0.05–0.10 per DJ set or covers search
- Hallucination prevention is enforced in all prompts: remixes require a named producer, covers require a known release — not just stylistic inference

## License

MIT
