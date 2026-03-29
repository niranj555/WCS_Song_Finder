# WCS Song Finder

An AI-powered song recommendation tool for West Coast Swing dancers. Describe the feel of the music you want to dance to — and Claude curates real songs that match your WCS musicality goals.

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

Claude returns 5 real songs — no hallucinated tracks — with WCS-specific dance notes, suggested patterns, competition history, and direct search links.

## Features

- **Quick Presets** — One-click setups for common WCS scenarios: Late Night Social, Competition Prelim, Showcase Closer, Musicality Drill, Improv Night, and more
- **Find Similar** — Click any recommended song to get 5 songs with similar WCS dance qualities
- **Favorites** — Heart songs to save them across sessions
- **History** — Full search history with all descriptor settings shown; replay any past search instantly
- **Dark / Light theme** — Toggle between neon dark and light smoke themes
- **In-memory caching** — Identical searches return instantly without hitting the API again
- **Login-protected** — Simple session auth; invite-only for demos

## Tech Stack

- **Backend**: Python + FastAPI
- **AI**: Claude Sonnet 4.6 (Anthropic)
- **Frontend**: Vanilla HTML/CSS/JS — no frameworks
- **Auth**: Session-based with `starlette.middleware.sessions`
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
   ```bash
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

### Without Docker

```bash
pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...
export APP_USERNAME=yourname
export APP_PASSWORD=yourpassword
export SESSION_SECRET=any-long-random-string
uvicorn main:app --reload
```

## Project Structure

```
wcs-song-finder/
├── main.py              # FastAPI app, routes, auth middleware
├── recommender.py       # Claude API integration, prompt engineering, caching
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── templates/
│   ├── index.html       # Main app UI
│   └── login.html       # Login page
└── static/
    ├── style.css        # Dark/light theme, neon accents
    └── app.js           # Presets, descriptors, API calls, history, favorites
```

## API

### `POST /recommend`

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

Returns 5 song recommendations with `why_it_fits`, `dance_notes`, `suggested_patterns`, `competition_history`, and `listen_query`.

### `POST /similar`

```json
{
  "title": "Leave the Door Open",
  "artist": "Silk Sonic"
}
```

Returns 5 songs with similar WCS dance qualities.

## Notes

- Each new request calls Claude Sonnet 4.6 — takes ~5–15 seconds
- Repeated identical searches are served from in-memory cache instantly
- API costs roughly $0.02–0.05 per recommendation set

## License

MIT
