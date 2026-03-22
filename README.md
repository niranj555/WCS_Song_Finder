# WCS Song Finder

An AI-powered song recommendation tool for West Coast Swing dancers. Describe the feel of the music you want to dance to — and Claude curates real songs that match your WCS musicality goals.

![WCS Song Finder](https://img.shields.io/badge/Powered%20by-Claude%20Opus%204.6-7c3aed?style=flat-square)
![Python](https://img.shields.io/badge/Python-3.11-blue?style=flat-square)
![FastAPI](https://img.shields.io/badge/FastAPI-latest-009688?style=flat-square)

## What It Does

Standard music apps filter by genre and BPM. This app speaks the language of WCS dancers:

- **Emotional Tone** — Playful, Sultry, Melancholic, Triumphant, Hypnotic, and more
- **Tempo Feel** — Slow / Medium / Fast (how it *dances*, not just the BPM)
- **Phrase Predictability** — Clean 8-counts vs deceptive fake-outs
- **Break Behavior** — Clear breaks, micro-pauses, sustained silence
- **Accent Sharpness** — Smooth & legato vs punchy & staccato
- **Elasticity Potential** — How much the song rewards stretch and delay
- **Risk Level** — Safe for prelims vs high-risk showcase material

Claude returns 5 real songs with dance notes, suggested patterns, competition history, and direct Spotify/YouTube search links.

## Demo

Set your descriptors → click **FIND MY SONGS** → get curated recommendations with WCS-specific analysis.

## Tech Stack

- **Backend**: Python + FastAPI
- **AI**: Claude Opus 4.6 (Anthropic) with adaptive thinking
- **Frontend**: Vanilla HTML/CSS/JS — no frameworks
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

2. **Add your API key**
   ```bash
   echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
   ```

3. **Run**
   ```bash
   docker-compose up
   ```

4. **Open** `http://localhost:8000`

### Without Docker

```bash
pip install -r requirements.txt
ANTHROPIC_API_KEY=sk-ant-... uvicorn main:app --reload
```

## Project Structure

```
wcs-song-finder/
├── main.py              # FastAPI app, routes, middleware
├── recommender.py       # Claude API integration + prompt engineering
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
├── templates/
│   └── index.html       # Single-page UI
└── static/
    ├── style.css        # Dark theme, neon accents
    └── app.js           # Form state, API calls, card rendering
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
  "emotional_tone": ["Sultry", "Melancholic"],
  "additional_context": "late-night social dancing"
}
```

Returns 5 song recommendations with `why_it_fits`, `dance_notes`, `suggested_patterns`, `competition_history`, and `listen_query` for Spotify/YouTube links.

## Notes

- Each request calls Claude Opus 4.6 and takes ~15–30 seconds
- API costs roughly $0.10–0.30 per recommendation set
- Add rate limiting before sharing publicly (see `slowapi`)

## License

MIT
