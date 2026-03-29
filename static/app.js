// ── Constants ────────────────────────────────────────────────
const PRESETS = [
  { name: "Late Night Social", icon: "🌙", tempo: "Slow", phrasePredict: 3, breaks: ["Micro-pauses", "Sustained silence"], accentSharp: 1, elasticity: 5, riskLevel: 2, tones: ["Hypnotic"] },
  { name: "Beginner Class", icon: "🌱", tempo: "Medium", phrasePredict: 1, breaks: ["Clear breaks"], accentSharp: 2, elasticity: 2, riskLevel: 1, tones: ["Playful", "Light"] },
  { name: "Showcase", icon: "✨", tempo: "Medium", phrasePredict: 3, breaks: ["Clear breaks", "Sustained silence"], accentSharp: 3, elasticity: 3, riskLevel: 3, tones: ["Cinematic", "Triumphant"] },
  { name: "Showcase Closer", icon: "🎆", tempo: "Fast", phrasePredict: 3, breaks: ["Clear breaks", "Sustained silence"], accentSharp: 4, elasticity: 4, riskLevel: 3, tones: ["Cinematic", "Triumphant"] },
  { name: "Musicality Drill", icon: "🎓", tempo: "Medium", phrasePredict: 4, breaks: ["Fake breaks"], accentSharp: 3, elasticity: 3, riskLevel: 3, tones: ["Playful", "Dark"] },
  { name: "Improv Night", icon: "🎲", tempo: "Medium", phrasePredict: 4, breaks: ["Fake breaks"], accentSharp: 2, elasticity: 4, riskLevel: 3, tones: ["Hypnotic", "Dark"] },
];

const DEFAULTS = {
  tempo: "Medium",
  phrasePredict: 3,
  breaks: ["Clear breaks"],
  accentSharp: 3,
  elasticity: 3,
  riskLevel: 2,
  tones: ["Playful"],
};

const MAX_HISTORY = 15;
const LS_HISTORY = "wcs_history";
const LS_FAVORITES = "wcs_favorites";
const LS_THEME = "wcs_theme";
const SONG_REGISTRY = new Map();
let _cardSeq = 0;

// ── State ────────────────────────────────────────────────────
const state = {
  tempoFeel: DEFAULTS.tempo,
  phrasePredict: DEFAULTS.phrasePredict,
  breakBehavior: [...DEFAULTS.breaks],
  accentSharp: DEFAULTS.accentSharp,
  elasticity: DEFAULTS.elasticity,
  riskLevel: DEFAULTS.riskLevel,
  emotionalTone: [...DEFAULTS.tones],
  genre: [],  // empty = All
  activePreset: null,
};

// ── DOM refs ─────────────────────────────────────────────────
const resultsPanel = () => document.getElementById("results-panel");
const findBtn = document.getElementById("find-btn");
const toast = document.getElementById("toast");

// ── Init ─────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initPresets();
  initRadios();
  initSliders();
  initPills();
  initInfoPanels();
  initTabs();
  initEventDelegation();
  syncPillsToState();
  findBtn.addEventListener("click", handleFind);
  renderHistoryPanel();
  renderFavoritesPanel();
  updateBadges();
});

// ── Theme ────────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem(LS_THEME) || "dark";
  applyTheme(saved);
  document.getElementById("theme-toggle").addEventListener("click", () => {
    const current = document.documentElement.dataset.theme || "dark";
    applyTheme(current === "dark" ? "light" : "dark");
  });
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const btn = document.getElementById("theme-toggle");
  if (btn) btn.textContent = theme === "dark" ? "☀️" : "🌙";
  localStorage.setItem(LS_THEME, theme);
}

// ── Presets ──────────────────────────────────────────────────
function initPresets() {
  const grid = document.getElementById("preset-grid");
  if (!grid) return;
  grid.innerHTML = PRESETS.map((p, i) => `
    <button class="preset-pill" data-index="${i}">${p.icon} ${p.name}</button>
  `).join("");
  grid.querySelectorAll(".preset-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      applyPreset(parseInt(btn.dataset.index), btn);
    });
  });
}

function resetToDefaults() {
  state.tempoFeel = DEFAULTS.tempo;
  document.querySelectorAll(".radio-btn").forEach((b) => {
    b.classList.toggle("selected", b.dataset.value === DEFAULTS.tempo);
  });
  setSlider("phrase-predict", "phrase-predict-val", "phrasePredict", DEFAULTS.phrasePredict);
  setSlider("accent-sharp", "accent-sharp-val", "accentSharp", DEFAULTS.accentSharp);
  setSlider("elasticity", "elasticity-val", "elasticity", DEFAULTS.elasticity);
  setSlider("risk-level", "risk-level-val", "riskLevel", DEFAULTS.riskLevel);
  state.breakBehavior = [...DEFAULTS.breaks];
  state.emotionalTone = [...DEFAULTS.tones];
  syncPillsToState();
}

function syncPillsToState() {
  document.querySelectorAll(".pill[data-group='break']").forEach((pill) => {
    pill.classList.toggle("selected", state.breakBehavior.includes(pill.dataset.value));
  });
  document.querySelectorAll(".pill[data-group='tone']").forEach((pill) => {
    pill.classList.toggle("selected", state.emotionalTone.includes(pill.dataset.value));
  });
}

function applyPreset(index, btn) {
  const p = PRESETS[index];

  // Toggle off if already active
  if (state.activePreset === p.name) {
    btn.classList.remove("active");
    state.activePreset = null;
    resetToDefaults();
    return;
  }

  // Deselect all preset pills
  document.querySelectorAll(".preset-pill").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  state.activePreset = p.name;

  // Apply tempo
  state.tempoFeel = p.tempo;
  document.querySelectorAll(".radio-btn").forEach((b) => {
    b.classList.toggle("selected", b.dataset.value === p.tempo);
  });

  // Apply sliders
  setSlider("phrase-predict", "phrase-predict-val", "phrasePredict", p.phrasePredict);
  setSlider("accent-sharp", "accent-sharp-val", "accentSharp", p.accentSharp);
  setSlider("elasticity", "elasticity-val", "elasticity", p.elasticity);
  setSlider("risk-level", "risk-level-val", "riskLevel", p.riskLevel);

  // Apply breaks
  state.breakBehavior = [...p.breaks];
  document.querySelectorAll(".pill[data-group='break']").forEach((pill) => {
    pill.classList.toggle("selected", p.breaks.includes(pill.dataset.value));
  });

  // Apply tones
  state.emotionalTone = [...p.tones];
  document.querySelectorAll(".pill[data-group='tone']").forEach((pill) => {
    pill.classList.toggle("selected", p.tones.includes(pill.dataset.value));
  });
}

function setSlider(id, valId, key, value) {
  const el = document.getElementById(id);
  const display = document.getElementById(valId);
  if (!el || !display) return;
  el.value = value;
  display.textContent = value;
  state[key] = value;
}

function markCustom() {
  state.activePreset = null;
  document.querySelectorAll(".preset-pill").forEach((b) => b.classList.remove("active"));
}

// ── Tabs ─────────────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tabName) {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });
  document.querySelectorAll(".tab-content").forEach((content) => {
    const id = content.id.replace("tab-", "");
    content.classList.toggle("hidden", id !== tabName);
  });
}

// ── Radios ───────────────────────────────────────────────────
function initRadios() {
  document.querySelectorAll(".radio-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".radio-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      state.tempoFeel = btn.dataset.value;
      markCustom();
    });
    if (btn.dataset.value === state.tempoFeel) btn.classList.add("selected");
  });
}

// ── Sliders ──────────────────────────────────────────────────
function initSliders() {
  const sliders = [
    { id: "phrase-predict", key: "phrasePredict", valueId: "phrase-predict-val" },
    { id: "accent-sharp",   key: "accentSharp",   valueId: "accent-sharp-val" },
    { id: "elasticity",     key: "elasticity",     valueId: "elasticity-val" },
    { id: "risk-level",     key: "riskLevel",      valueId: "risk-level-val" },
  ];

  sliders.forEach(({ id, key, valueId }) => {
    const el = document.getElementById(id);
    const display = document.getElementById(valueId);
    if (!el) return;
    display.textContent = el.value;
    el.addEventListener("input", () => {
      state[key] = parseInt(el.value);
      display.textContent = el.value;
      markCustom();
    });
  });
}

// ── Pills ────────────────────────────────────────────────────
function initPills() {
  document.querySelectorAll(".pill[data-group]").forEach((pill) => {
    pill.addEventListener("click", () => {
      const group = pill.dataset.group;
      const value = pill.dataset.value;

      if (group === "genre") {
        if (value === "All") {
          // Select All, deselect everything else
          state.genre = [];
          document.querySelectorAll(".pill[data-group='genre']").forEach((p) => p.classList.remove("selected"));
          pill.classList.add("selected");
        } else {
          // Toggle this genre, deselect All
          document.querySelector(".genre-all").classList.remove("selected");
          if (state.genre.includes(value)) {
            state.genre = state.genre.filter((v) => v !== value);
            pill.classList.remove("selected");
            // If nothing selected, revert to All
            if (state.genre.length === 0) {
              document.querySelector(".genre-all").classList.add("selected");
            }
          } else {
            state.genre.push(value);
            pill.classList.add("selected");
          }
        }
        markCustom();
      } else if (group === "break") {
        if (state.breakBehavior.includes(value)) {
          state.breakBehavior = state.breakBehavior.filter((v) => v !== value);
          pill.classList.remove("selected");
        } else {
          state.breakBehavior.push(value);
          pill.classList.add("selected");
        }
        markCustom();
      } else if (group === "tone") {
        if (state.emotionalTone.includes(value)) {
          state.emotionalTone = state.emotionalTone.filter((v) => v !== value);
          pill.classList.remove("selected");
          markCustom();
        } else if (state.emotionalTone.length < 3) {
          state.emotionalTone.push(value);
          pill.classList.add("selected");
          markCustom();
        } else {
          showToast("Pick up to 3 emotional tones.");
        }
      }
    });
  });
}

// ── Info Panels ──────────────────────────────────────────────
function initInfoPanels() {
  document.querySelectorAll(".info-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.target;
      const panel = document.getElementById(targetId);
      if (!panel) return;
      const isOpen = panel.classList.contains("open");
      document.querySelectorAll(".info-panel.open").forEach((p) => p.classList.remove("open"));
      document.querySelectorAll(".info-btn.active").forEach((b) => b.classList.remove("active"));
      if (!isOpen) {
        panel.classList.add("open");
        btn.classList.add("active");
      }
    });
  });
}

// ── Event Delegation ─────────────────────────────────────────
function initEventDelegation() {
  document.body.addEventListener("click", (e) => {
    // Heart button
    const heartBtn = e.target.closest(".heart-btn");
    if (heartBtn) {
      e.stopPropagation();
      const card = heartBtn.closest(".song-card");
      if (!card) return;
      const song = SONG_REGISTRY.get(card.dataset.key);
      if (song) toggleFavorite(heartBtn, song);
      return;
    }

    // Find similar button
    const similarBtn = e.target.closest(".find-similar-btn");
    if (similarBtn) {
      e.stopPropagation();
      const card = similarBtn.closest(".song-card");
      if (!card) return;
      const song = SONG_REGISTRY.get(card.dataset.key);
      if (song) handleFindSimilar(song.title, song.artist, similarBtn);
      return;
    }

    // Song card header (expand/collapse)
    const header = e.target.closest(".song-card-header");
    if (header) {
      const card = header.closest(".song-card");
      if (card) toggleCard(card);
      return;
    }

    // History entry
    const historyEntry = e.target.closest(".history-entry");
    if (historyEntry) {
      replayHistory(parseInt(historyEntry.dataset.id));
      return;
    }
  });
}

// ── Find Handler ─────────────────────────────────────────────
async function handleFind() {
  if (state.breakBehavior.length === 0) {
    showToast("Please select at least one Break Behavior.");
    return;
  }
  if (state.emotionalTone.length === 0) {
    showToast("Please select at least one Emotional Tone.");
    return;
  }

  findBtn.disabled = true;
  findBtn.textContent = "READING THE GROOVE…";
  findBtn.classList.add("loading");
  switchTab("results");
  showSkeleton();

  try {
    const payload = {
      tempo_feel: state.tempoFeel,
      phrase_predictability: state.phrasePredict,
      break_behavior: state.breakBehavior,
      accent_sharpness: state.accentSharp,
      elasticity_potential: state.elasticity,
      risk_level: state.riskLevel,
      emotional_tone: state.emotionalTone,
      genre: state.genre,
      additional_context: "",
    };

    const res = await fetch("/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    addToHistory(payload, data, state.activePreset);
    renderResults(data);
  } catch (err) {
    showToast(`Error: ${err.message}`);
    showEmptyState();
  } finally {
    findBtn.disabled = false;
    findBtn.textContent = "FIND MY SONGS";
    findBtn.classList.remove("loading");
  }
}

// ── Find Similar Handler ──────────────────────────────────────
async function handleFindSimilar(title, artist, btn) {
  btn.disabled = true;
  btn.textContent = "Finding…";
  switchTab("results");
  showSkeleton();

  try {
    const res = await fetch("/similar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, artist }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    data._similarTo = { title, artist };
    renderResults(data);
  } catch (err) {
    showToast(`Error: ${err.message}`);
    showEmptyState();
  } finally {
    btn.disabled = false;
    btn.textContent = "Find Similar";
  }
}

// ── Render ───────────────────────────────────────────────────
function showEmptyState() {
  resultsPanel().innerHTML = `
    <div class="empty-state">
      <div class="icon">🎧</div>
      <h2>Set your vibe, find your groove</h2>
      <p>Dial in the descriptors or pick a preset, and Claude will curate real songs that match your WCS musicality goals.</p>
    </div>`;
}

function showSkeleton() {
  const cards = Array.from({ length: 5 }, () => `
    <div class="skeleton-card">
      <div class="skeleton-line title"></div>
      <div class="skeleton-line artist"></div>
      <div class="skeleton-line body"></div>
      <div class="skeleton-line body s"></div>
      <div class="skeleton-line body"></div>
      <div class="skeleton-line note" style="margin-top:12px"></div>
      <div class="skeleton-line note s"></div>
    </div>`).join("");
  resultsPanel().innerHTML = `<div class="skeleton-cards">${cards}</div>`;
}

function renderResults(data) {
  const { recommendations = [], curator_note = "" } = data;

  const similarBanner = data._similarTo
    ? `<div class="similar-banner">Songs similar to <strong>${escHtml(data._similarTo.title)}</strong> by <strong>${escHtml(data._similarTo.artist)}</strong></div>`
    : "";

  const noteHtml = curator_note
    ? `<div class="curator-note"><strong>Curator's Note</strong>${escHtml(curator_note)}</div>`
    : "";

  const cardsHtml = recommendations.map((song, i) => renderCard(song, i)).join("");

  resultsPanel().innerHTML = `
    ${similarBanner}
    ${noteHtml}
    <div class="songs-grid">${cardsHtml}</div>`;
}

function renderCard(song, index) {
  const delay = index * 0.08;
  const {
    title = "Unknown",
    artist = "",
    why_it_fits = "",
    dance_notes = "",
    suggested_patterns = [],
    competition_history = "",
    listen_query = `${artist} ${title}`,
  } = song;

  const key = `card_${_cardSeq++}`;
  SONG_REGISTRY.set(key, { title, artist, why_it_fits, dance_notes, suggested_patterns, competition_history, listen_query });

  const encoded = encodeURIComponent(listen_query);
  const spotifyUrl = `https://open.spotify.com/search/${encoded}`;
  const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(listen_query + " west coast swing")}`;

  const patternsHtml = suggested_patterns.length
    ? `<div class="card-section">
        <div class="card-section-label">Suggested Patterns</div>
        <div class="patterns-row">${suggested_patterns.map((p) => `<span class="pattern-pill">${escHtml(p)}</span>`).join("")}</div>
      </div>`
    : "";

  const compHtml = competition_history
    ? `<div class="card-section">
        <div class="card-section-label">🏆 Competition History</div>
        <div class="comp-history">${escHtml(competition_history)}</div>
      </div>`
    : "";

  const faved = isFavorite(title, artist);
  const heartClass = faved ? "heart-btn active" : "heart-btn";
  const heartChar = faved ? "♥" : "♡";

  return `
    <div class="song-card" data-key="${key}" style="animation-delay: ${delay}s">
      <div class="song-card-header">
        <div class="song-header-main">
          <div class="song-number">Track ${String(index + 1).padStart(2, "0")}</div>
          <div class="song-title">${escHtml(title)}</div>
          <div class="song-artist">${escHtml(artist)}</div>
        </div>
        <div class="song-header-actions">
          <button class="${heartClass}" title="Add to favorites">${heartChar}</button>
          <span class="expand-chevron">›</span>
        </div>
      </div>
      <div class="song-card-body">
        <div class="card-section">
          <div class="card-section-label">Why It Fits</div>
          <div class="why-text">${escHtml(why_it_fits)}</div>
        </div>

        <div class="card-section">
          <div class="card-section-label">Dance Notes</div>
          <div class="dance-note">${escHtml(dance_notes)}</div>
        </div>

        ${patternsHtml}
        ${compHtml}

        <div class="listen-row">
          <a class="listen-btn spotify" href="${spotifyUrl}" target="_blank" rel="noopener">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
            Spotify
          </a>
          <a class="listen-btn youtube" href="${ytUrl}" target="_blank" rel="noopener">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
            YouTube
          </a>
          <button class="find-similar-btn">Find Similar</button>
        </div>
      </div>
    </div>`;
}

function toggleCard(card) {
  card.classList.toggle("expanded");
}

// ── Favorites ─────────────────────────────────────────────────
function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem(LS_FAVORITES) || "[]");
  } catch {
    return [];
  }
}

function saveFavorites(favs) {
  localStorage.setItem(LS_FAVORITES, JSON.stringify(favs));
  updateBadges();
  renderFavoritesPanel();
}

function isFavorite(title, artist) {
  return getFavorites().some((f) => f.title === title && f.artist === artist);
}

function toggleFavorite(btn, song) {
  const favs = getFavorites();
  const existingIndex = favs.findIndex((f) => f.title === song.title && f.artist === song.artist);

  if (existingIndex >= 0) {
    favs.splice(existingIndex, 1);
    btn.textContent = "♡";
    btn.classList.remove("active");
    showToast(`Removed "${song.title}" from favorites.`);
  } else {
    favs.push(song);
    btn.textContent = "♥";
    btn.classList.add("active");
    showToast(`Added "${song.title}" to favorites!`);
  }

  saveFavorites(favs);
}

function renderFavoritesPanel() {
  const panel = document.getElementById("favorites-panel");
  if (!panel) return;
  const favs = getFavorites();

  if (favs.length === 0) {
    panel.innerHTML = `
      <div class="empty-state">
        <div class="icon">♡</div>
        <h2>No favorites yet</h2>
        <p>Tap the heart on any song card to save it here.</p>
      </div>`;
    return;
  }

  const cardsHtml = favs.map((song, i) => renderCard(song, i)).join("");
  panel.innerHTML = `<div class="songs-grid">${cardsHtml}</div>`;
}

// ── History ───────────────────────────────────────────────────
function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(LS_HISTORY) || "[]");
  } catch {
    return [];
  }
}

function addToHistory(payload, data, presetName) {
  const history = getHistory();
  const entry = {
    id: Date.now(),
    presetName: presetName || null,
    payload,
    data,
    topSong: data.recommendations && data.recommendations[0] ? data.recommendations[0] : null,
  };
  history.unshift(entry);
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
  localStorage.setItem(LS_HISTORY, JSON.stringify(history));
  updateBadges();
  renderHistoryPanel();
}

function renderHistoryPanel() {
  const panel = document.getElementById("history-panel");
  if (!panel) return;
  const history = getHistory();

  if (history.length === 0) {
    panel.innerHTML = `
      <div class="empty-state">
        <div class="icon">🕐</div>
        <h2>No history yet</h2>
        <p>Your recent searches will appear here.</p>
      </div>`;
    return;
  }

  const entriesHtml = history.map((entry) => {
    const p = entry.payload;
    const label = entry.presetName ? entry.presetName : null;
    const songInfo = entry.topSong
      ? `<div class="history-song">${escHtml(entry.topSong.title)} <span>by ${escHtml(entry.topSong.artist)}</span></div>`
      : "";
    const count = entry.data.recommendations ? entry.data.recommendations.length : 0;

    const genre = (p.genre && p.genre.length > 0) ? p.genre.join(", ") : "All";
    const breaks = (p.break_behavior && p.break_behavior.length > 0) ? p.break_behavior.join(", ") : "—";
    const tones = (p.emotional_tone && p.emotional_tone.length > 0) ? p.emotional_tone.join(", ") : "—";

    const descriptors = `
      <div class="history-descriptors">
        <span class="hdesc-item"><span class="hdesc-key">Tempo</span> ${escHtml(p.tempo_feel)}</span>
        <span class="hdesc-item"><span class="hdesc-key">Genre</span> ${escHtml(genre)}</span>
        <span class="hdesc-item"><span class="hdesc-key">Tone</span> ${escHtml(tones)}</span>
        <span class="hdesc-item"><span class="hdesc-key">Breaks</span> ${escHtml(breaks)}</span>
        <span class="hdesc-item"><span class="hdesc-key">Predictability</span> ${p.phrase_predictability}/5</span>
        <span class="hdesc-item"><span class="hdesc-key">Sharpness</span> ${p.accent_sharpness}/5</span>
        <span class="hdesc-item"><span class="hdesc-key">Elasticity</span> ${p.elasticity_potential}/5</span>
        <span class="hdesc-item"><span class="hdesc-key">Risk</span> ${p.risk_level}/5</span>
      </div>`;

    return `
      <div class="history-entry" data-id="${entry.id}">
        <div class="history-meta">
          ${label ? `<span class="history-label">${escHtml(label)}</span>` : ""}
          <span class="history-time">${timeAgo(entry.id)}</span>
        </div>
        ${descriptors}
        ${songInfo}
        <div class="history-count">${count} songs</div>
      </div>`;
  }).join("");

  panel.innerHTML = entriesHtml;
}

function replayHistory(id) {
  const history = getHistory();
  const entry = history.find((e) => e.id === id);
  if (!entry) return;
  switchTab("results");
  renderResults(entry.data);
}

function updateBadges() {
  const historyCount = document.getElementById("history-count");
  const favCount = document.getElementById("fav-count");

  const hLen = getHistory().length;
  const fLen = getFavorites().length;

  if (historyCount) {
    historyCount.textContent = hLen;
    historyCount.classList.toggle("hidden", hLen === 0);
  }
  if (favCount) {
    favCount.textContent = fLen;
    favCount.classList.toggle("hidden", fLen === 0);
  }
}

// ── Utilities ─────────────────────────────────────────────────
function timeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3500);
}
