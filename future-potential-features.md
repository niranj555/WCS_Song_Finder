# Future Potential Features

## 1. Shazam-like Song Detection

**Idea:** Let a user hold up their phone/mic at a dance event and identify the song currently playing, then immediately get WCS analysis and similar song recommendations for it.

**How it could work:**
- Capture a short audio clip (5–10 seconds) from the browser via `getUserMedia` / Web Audio API
- Send the audio buffer to a fingerprinting service (ACRCloud or AudD have REST APIs with free tiers) to identify the song
- Once identified, pipe `title + artist` straight into the existing `/similar` endpoint to get WCS-relevant recommendations
- Show the identified song as a card with "Find Similar" pre-triggered

**Key considerations:**
- Browser mic access requires HTTPS (already required for production)
- ACRCloud free tier: 100 recognitions/day — enough for a personal/small-group tool
- AudD is simpler (single endpoint, no SDK) and has a free tier too
- No model changes needed — the identified song just feeds into the existing `get_similar_songs()` flow
- Would need a new `POST /identify` endpoint in `main.py` that accepts raw audio, calls the fingerprint API, and returns `{title, artist}` (or auto-redirects to `/similar`)

**UX sketch:**
- A "🎵 What's Playing?" button in the UI
- Tap → 5-second countdown while recording → spinner → song card appears with WCS notes + similar recommendations

---

## 2. Voice Commands

**Idea:** Let users describe what they want by speaking instead of clicking sliders and pills — e.g. "I want something slow and soulful with high elasticity for a late-night set."

**How it could work:**
- Use the Web Speech API (`SpeechRecognition`) for transcription — works natively in Chrome/Edge, no server round-trip
- Send the transcript to Claude (new endpoint `POST /voice-parse`) with a short parsing prompt
- Claude extracts structured descriptor values from the natural language: `{tempo_feel, phrase_predictability, emotional_tone, genre, bpm_range, ...}`
- Apply those values to the UI state and trigger a search automatically

**Key considerations:**
- Web Speech API is Chrome/Edge only (no Safari/Firefox without a polyfill) — flag this in the UI
- The parsing prompt needs to map loose language to the exact enum values the app uses (e.g. "groovy and upbeat" → `tempo_feel: "Medium"`, `emotional_tone: ["Playful"]`)
- Fallback: if confidence is low on any field, leave that field at its current state rather than overriding it
- Could also use browser speech as a shortcut trigger — e.g. "find songs" or "build a DJ set" maps to the relevant button action

**UX sketch:**
- Mic icon button near the top of the descriptor panel
- Tap → "Listening…" state → transcript appears as editable text → Claude parses it → sliders/pills update visually → auto-search fires
- Show the parsed transcript so the user can see what Claude understood

---

## 3. Song Feedback Loop

**Idea:** Let users rate individual song recommendations (thumbs up / thumbs down) so the engine learns what fits their taste and avoids repeating bad matches.

**How it could work:**
- Thumbs up / thumbs down buttons on each song card (stored in `localStorage`)
- Negative feedback: disliked songs injected into subsequent prompts — "Do NOT recommend any of these songs, the user has marked them as poor fits: [list]"
- Positive feedback: liked songs used to bias prompts — "The user loved these songs previously: [list] — find more with similar WCS qualities"
- No model changes needed — just prompt injection via `build_user_prompt()` reading localStorage feedback
- Server-side option: persist feedback to SQLite for cross-device use

**Key considerations:**
- localStorage feedback is ephemeral and device-specific; server-side persistence requires a user identity model
- Feedback list should be capped (e.g. last 20 dislikes, last 10 likes) to avoid bloating the prompt
- Dislike feedback is highest priority — users hate seeing the same bad song twice

**UX sketch:**
- 👍 / 👎 icon buttons appear on hover on each song card
- Disliked songs get a subtle crossed-out visual in History tab
- A "Reset Feedback" option in settings clears the slate

---

## 4. Spotify Playlist Export

**Idea:** Let users export their WCS playlist directly to Spotify with one click.

**How it could work:**
- "Export to Spotify" button on the Playlist tab
- Spotify Web API PKCE auth flow (client-side only — no backend secret needed, just a registered Spotify app client ID)
- After OAuth, search Spotify for each song's URI via `GET /search?q=track:{title}+artist:{artist}&type=track&limit=1`
- Create a new Spotify playlist via `POST /me/playlists`, then batch-add URIs via `POST /playlists/{id}/tracks`
- Graceful fallback: songs not found on Spotify are listed separately so the user can add them manually

**Key considerations:**
- Requires a Spotify Developer account + registered app (free) to get a `client_id`
- PKCE flow works entirely in the browser — no backend changes needed
- Spotify API rate limits are generous for personal use
- Song matching by title+artist may occasionally pick the wrong version (live vs. studio); show the matched track name so users can spot errors

**UX sketch:**
- Spotify green "Export to Spotify" button in the Playlist tab toolbar
- If not authenticated → opens Spotify login popup, redirects back
- Progress bar while songs are being matched and added
- Success: "Playlist created → Open in Spotify" link
