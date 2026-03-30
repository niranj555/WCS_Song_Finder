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
const LS_PLAYLISTS = "wcs_playlists";   // [{id, name, songs[]}]
const LS_ACTIVE_PL = "wcs_active_pl";  // active playlist id
const SONG_REGISTRY = new Map();
let _cardSeq = 0;

const ENERGY_COLORS = {
  "Opener":      "#00d4ff",
  "Early Build": "#33ffaa",
  "Mid-Set":     "#00ff87",
  "Peak":        "#ff6b6b",
  "Cool-Down":   "#bb88ff",
  "Late Night":  "#5588ff",
  "Closer":      "#ffcc44",
};

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
  document.getElementById("djset-btn").addEventListener("click", handleDJSet);
  document.getElementById("covers-btn").addEventListener("click", handleCovers);
  renderHistoryPanel();
  renderFavoritesPanel();
  renderPlaylistPanel();
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
          state.genre = [];
          document.querySelectorAll(".pill[data-group='genre']").forEach((p) => p.classList.remove("selected"));
          pill.classList.add("selected");
        } else {
          document.querySelector(".genre-all").classList.remove("selected");
          if (state.genre.includes(value)) {
            state.genre = state.genre.filter((v) => v !== value);
            pill.classList.remove("selected");
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
    // Playlist "+" button
    const playlistBtn = e.target.closest(".add-playlist-btn");
    if (playlistBtn) {
      e.stopPropagation();
      const card = playlistBtn.closest(".song-card");
      if (!card) return;
      const song = SONG_REGISTRY.get(card.dataset.key);
      if (song) addToPlaylist(song);
      return;
    }

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

// ── Find Handler (SSE streaming) ──────────────────────────────
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
  showSkeleton(5);

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

  try {
    const res = await fetch("/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let songsRendered = 0;
    let allSongs = [];
    let curatorNote = "";
    let awaitingDoneData = false;
    let awaitingErrorData = false;

    // Replace skeleton with live grid
    resultsPanel().innerHTML = `<div id="live-curator-note"></div><div class="songs-grid" id="streaming-grid"></div>`;
    const gridEl = document.getElementById("streaming-grid");

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by double newlines
      const parts = buffer.split("\n\n");
      buffer = parts.pop(); // keep incomplete event

      for (const part of parts) {
        if (!part.trim()) continue;
        const lines = part.split("\n");
        let eventType = null;
        let dataStr = null;

        for (const line of lines) {
          if (line.startsWith("event: ")) eventType = line.slice(7).trim();
          else if (line.startsWith("data: ")) dataStr = line.slice(6);
        }

        if (!dataStr) continue;

        let parsed;
        try { parsed = JSON.parse(dataStr); }
        catch { continue; }

        if (eventType === "error") {
          throw new Error(parsed.error || "Streaming error");
        } else if (eventType === "done") {
          curatorNote = parsed.curator_note || "";
          const noteEl = document.getElementById("live-curator-note");
          if (noteEl && curatorNote) {
            noteEl.innerHTML = `<div class="curator-note"><strong>Curator's Note</strong>${escHtml(curatorNote)}</div>`;
          }
        } else {
          // Regular song
          allSongs.push(parsed);
          gridEl.insertAdjacentHTML("beforeend", renderCard(parsed, songsRendered++));
        }
      }
    }

    addToHistory(payload, { recommendations: allSongs, curator_note: curatorNote }, state.activePreset);

    if (allSongs.length === 0) showEmptyState();

  } catch (err) {
    showToast(`Error: ${err.message}`);
    showEmptyState();
  } finally {
    findBtn.disabled = false;
    findBtn.textContent = "FIND MY SONGS";
    findBtn.classList.remove("loading");
  }
}

// ── DJ Set Handler ────────────────────────────────────────────
async function handleDJSet() {
  if (state.breakBehavior.length === 0) {
    showToast("Please select at least one Break Behavior.");
    return;
  }
  if (state.emotionalTone.length === 0) {
    showToast("Please select at least one Emotional Tone.");
    return;
  }

  const djBtn = document.getElementById("djset-btn");
  djBtn.disabled = true;
  djBtn.textContent = "BUILDING YOUR SET…";
  djBtn.classList.add("loading");
  switchTab("results");
  showSkeleton(7);

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

    const res = await fetch("/djset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    renderDJSet(data);
  } catch (err) {
    showToast(`Error: ${err.message}`);
    showEmptyState();
  } finally {
    djBtn.disabled = false;
    djBtn.textContent = "BUILD DJ SET";
    djBtn.classList.remove("loading");
  }
}

// ── Covers & Remixes Handler ──────────────────────────────────
async function handleCovers() {
  if (state.breakBehavior.length === 0) {
    showToast("Please select at least one Break Behavior.");
    return;
  }
  if (state.emotionalTone.length === 0) {
    showToast("Please select at least one Emotional Tone.");
    return;
  }

  const btn = document.getElementById("covers-btn");
  btn.disabled = true;
  btn.textContent = "SEARCHING…";
  btn.classList.add("loading");
  switchTab("results");
  showSkeleton(5);

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

    const res = await fetch("/covers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    renderCoversRemixes(data);
  } catch (err) {
    showToast(`Error: ${err.message}`);
    showEmptyState();
  } finally {
    btn.disabled = false;
    btn.textContent = "COVERS & REMIXES";
    btn.classList.remove("loading");
  }
}

function renderCoversRemixes(data) {
  const { recommendations = [], curator_note = "" } = data;
  const noteHtml = curator_note
    ? `<div class="curator-note"><strong>Curator's Note</strong>${escHtml(curator_note)}</div>`
    : "";
  const cardsHtml = recommendations.map((song, i) => renderCoverCard(song, i)).join("");
  resultsPanel().innerHTML = `
    <div class="covers-banner">COVERS &amp; REMIXES</div>
    ${noteHtml}
    <div class="songs-grid">${cardsHtml}</div>`;
}

function renderCoverCard(song, index) {
  const typeColor = song.type === "remix" ? "#00d4ff" : "#bb88ff";
  const typeBadge = `<span class="cover-type-badge" style="background:${typeColor}22;color:${typeColor};border:1px solid ${typeColor}55">${escHtml((song.type || "remix").toUpperCase())}</span>`;
  const originalLine = (song.original_title && song.original_artist)
    ? `<div class="cover-original">Originally by <strong>${escHtml(song.original_artist)}</strong> · ${escHtml(song.original_title)}</div>`
    : "";
  const base = renderCard(song, index);
  return base
    .replace('<div class="song-number">', `${typeBadge}<div class="song-number">`)
    .replace('<div class="song-card-body">', `<div class="song-card-body">${originalLine}`);
}

// ── Find Similar Handler ──────────────────────────────────────
async function handleFindSimilar(title, artist, btn) {
  btn.disabled = true;
  btn.textContent = "Finding…";
  switchTab("results");
  showSkeleton(5);

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

function showSkeleton(count = 5) {
  const cards = Array.from({ length: count }, () => `
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

function renderDJSet(data) {
  const { set = [], curator_note = "" } = data;
  const noteHtml = curator_note
    ? `<div class="curator-note"><strong>DJ Set Curator's Note</strong>${escHtml(curator_note)}</div>`
    : "";
  const cardsHtml = set.map((song, i) => renderDJCard(song, i)).join("");
  resultsPanel().innerHTML = `
    <div class="djset-banner">DJ SET — Energy Arc (${set.length} songs)</div>
    ${noteHtml}
    <div class="songs-grid">${cardsHtml}</div>`;
}

function renderDJCard(song, index) {
  const color = ENERGY_COLORS[song.energy_label] || "var(--accent)";
  const energyBadge = `<span class="energy-label" style="background:${color}22;color:${color};border:1px solid ${color}55">${escHtml(song.energy_label || "")}</span>`;
  const base = renderCard(song, index);
  return base.replace('<div class="song-number">', `${energyBadge}<div class="song-number">`);
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
          <button class="add-playlist-btn" title="Add to playlist">+</button>
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

// ── Playlists (multiple) ──────────────────────────────────────
function getPlaylists() {
  try { return JSON.parse(localStorage.getItem(LS_PLAYLISTS) || "[]"); }
  catch { return []; }
}

function savePlaylists(pls) {
  localStorage.setItem(LS_PLAYLISTS, JSON.stringify(pls));
  updateBadges();
  renderPlaylistPanel();
}

function getActivePlId() {
  return localStorage.getItem(LS_ACTIVE_PL) || null;
}

function getActivePl() {
  const pls = getPlaylists();
  const id = getActivePlId();
  return pls.find((p) => p.id === id) || pls[0] || null;
}

function setActivePl(id) {
  localStorage.setItem(LS_ACTIVE_PL, id);
  renderPlaylistPanel();
  updateBadges();
}

function createPlaylist() {
  const pls = getPlaylists();
  const id = `pl_${Date.now()}`;
  const name = `Playlist ${pls.length + 1}`;
  pls.push({ id, name, songs: [] });
  localStorage.setItem(LS_ACTIVE_PL, id);
  savePlaylists(pls);
  // Focus the name input after render
  setTimeout(() => {
    const el = document.getElementById("playlist-name");
    if (el) { el.focus(); el.select(); }
  }, 50);
}

function deleteActivePl() {
  const pls = getPlaylists();
  const active = getActivePl();
  if (!active) return;
  const idx = pls.findIndex((p) => p.id === active.id);
  pls.splice(idx, 1);
  // Switch to nearest remaining playlist
  const next = pls[Math.max(0, idx - 1)];
  if (next) localStorage.setItem(LS_ACTIVE_PL, next.id);
  else localStorage.removeItem(LS_ACTIVE_PL);
  savePlaylists(pls);
}

function addToPlaylist(song) {
  const pls = getPlaylists();
  const activeId = getActivePlId();

  // Find active playlist within the same array we'll save
  let activePl = pls.find((p) => p.id === activeId) || pls[0] || null;

  // Auto-create first playlist if none exist
  if (!activePl) {
    const id = `pl_${Date.now()}`;
    activePl = { id, name: "Playlist 1", songs: [] };
    pls.push(activePl);
    localStorage.setItem(LS_ACTIVE_PL, id);
  }

  if (activePl.songs.some((s) => s.title === song.title && s.artist === song.artist)) {
    showToast(`"${song.title}" is already in "${activePl.name}".`);
    return;
  }
  activePl.songs.push(song);
  savePlaylists(pls);
  showToast(`Added "${song.title}" to "${activePl.name}"!`);
}

function renderPlaylistPanel() {
  const panel = document.getElementById("playlist-panel");
  if (!panel) return;
  const pls = getPlaylists();

  if (pls.length === 0) {
    panel.innerHTML = `
      <div class="playlist-toolbar">
        <button class="playlist-action-btn playlist-new-btn" id="playlist-new-btn">+ New Playlist</button>
      </div>
      <div class="empty-state">
        <div class="icon">🎶</div>
        <h2>No playlists yet</h2>
        <p>Tap + on any song card to add it to a playlist, or create one now.</p>
      </div>`;
    document.getElementById("playlist-new-btn").addEventListener("click", createPlaylist);
    return;
  }

  const active = getActivePl();
  const activeId = active ? active.id : pls[0].id;

  const selectorOptions = pls.map((p) =>
    `<option value="${p.id}" ${p.id === activeId ? "selected" : ""}>${escHtml(p.name)} (${p.songs.length})</option>`
  ).join("");

  panel.innerHTML = `
    <div class="playlist-toolbar">
      <select class="playlist-selector" id="playlist-selector">${selectorOptions}</select>
      <button class="playlist-action-btn playlist-new-btn" id="playlist-new-btn">+ New</button>
      <button class="playlist-action-btn playlist-copy-btn" id="playlist-copy-btn">Copy</button>
      <button class="playlist-action-btn playlist-del-btn" id="playlist-del-btn">Delete</button>
    </div>
    <div class="playlist-name-row">
      <input type="text" class="playlist-name-input" id="playlist-name"
             placeholder="Rename playlist…"
             value="${escHtml(active ? active.name : "")}" />
      <button class="playlist-action-btn playlist-clear-btn" id="playlist-clear-btn">Clear songs</button>
    </div>
    ${active && active.songs.length > 0
      ? `<div class="songs-grid">${active.songs.map((song, i) => renderCard(song, i)).join("")}</div>`
      : `<div class="empty-state" style="padding:40px 0"><div class="icon" style="font-size:2rem">🎵</div><p>No songs yet — tap + on any card.</p></div>`
    }`;

  document.getElementById("playlist-selector").addEventListener("change", (e) => setActivePl(e.target.value));
  document.getElementById("playlist-new-btn").addEventListener("click", createPlaylist);
  document.getElementById("playlist-copy-btn").addEventListener("click", copyPlaylistToClipboard);
  document.getElementById("playlist-del-btn").addEventListener("click", () => {
    if (confirm(`Delete "${active ? active.name : "this playlist"}"?`)) deleteActivePl();
  });
  document.getElementById("playlist-name").addEventListener("input", (e) => {
    const pls2 = getPlaylists();
    const pl = pls2.find((p) => p.id === activeId);
    if (pl) {
      pl.name = e.target.value;
      localStorage.setItem(LS_PLAYLISTS, JSON.stringify(pls2));
      // Update selector option text live
      const opt = document.querySelector(`#playlist-selector option[value="${activeId}"]`);
      if (opt) opt.textContent = `${e.target.value} (${pl.songs.length})`;
    }
  });
  document.getElementById("playlist-clear-btn").addEventListener("click", () => {
    if (confirm("Remove all songs from this playlist?")) {
      const pls2 = getPlaylists();
      const pl = pls2.find((p) => p.id === activeId);
      if (pl) { pl.songs = []; savePlaylists(pls2); }
    }
  });
}

function copyPlaylistToClipboard() {
  const active = getActivePl();
  const songs = active ? active.songs : [];
  const name = active ? active.name : "My WCS Playlist";
  const lines = [`# ${name}`, ""];
  songs.forEach((song, i) => lines.push(`${i + 1}. ${song.title} — ${song.artist}`));
  const text = lines.join("\n");

  if (songs.length === 0) { showToast("Playlist is empty — nothing to copy."); return; }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => showToast("Playlist copied to clipboard!"))
      .catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand("copy");
    showToast("Playlist copied to clipboard!");
  } catch {
    showToast("Copy failed — please select and copy manually.");
  }
  document.body.removeChild(ta);
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
  const playlistCount = document.getElementById("playlist-count");

  const hLen = getHistory().length;
  const fLen = getFavorites().length;
  const activePl = getActivePl();
  const pLen = activePl ? activePl.songs.length : 0;

  if (historyCount) {
    historyCount.textContent = hLen;
    historyCount.classList.toggle("hidden", hLen === 0);
  }
  if (favCount) {
    favCount.textContent = fLen;
    favCount.classList.toggle("hidden", fLen === 0);
  }
  if (playlistCount) {
    playlistCount.textContent = pLen;
    playlistCount.classList.toggle("hidden", pLen === 0);
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
