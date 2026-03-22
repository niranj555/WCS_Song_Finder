// ── State ──────────────────────────────────────────────────
const state = {
  tempoFeel: "Medium",
  phrasePredict: 3,
  breakBehavior: [],
  accentSharp: 3,
  elasticity: 3,
  riskLevel: 2,
  emotionalTone: [],
  context: "",
};

// ── DOM refs ────────────────────────────────────────────────
const resultsPanel = document.getElementById("results-panel");
const findBtn = document.getElementById("find-btn");
const toast = document.getElementById("toast");

// ── Init ────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  initRadios();
  initSliders();
  initPills();
  initInfoPanels();
  initContext();
  findBtn.addEventListener("click", handleFind);
});

// Tempo radio buttons
function initRadios() {
  document.querySelectorAll(".radio-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".radio-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      state.tempoFeel = btn.dataset.value;
    });
    if (btn.dataset.value === state.tempoFeel) btn.classList.add("selected");
  });
}

// Sliders
function initSliders() {
  const sliders = [
    { id: "phrase-predict", key: "phrasePredict", valueId: "phrase-predict-val" },
    { id: "accent-sharp",   key: "accentSharp",   valueId: "accent-sharp-val" },
    { id: "elasticity",     key: "elasticity",     valueId: "elasticity-val" },
    { id: "risk-level",     key: "riskLevel",       valueId: "risk-level-val" },
  ];

  sliders.forEach(({ id, key, valueId }) => {
    const el = document.getElementById(id);
    const display = document.getElementById(valueId);
    if (!el) return;
    display.textContent = el.value;
    el.addEventListener("input", () => {
      state[key] = parseInt(el.value);
      display.textContent = el.value;
    });
  });
}

// Multi-select pill toggles
function initPills() {
  document.querySelectorAll(".pill[data-group]").forEach((pill) => {
    pill.addEventListener("click", () => {
      const group = pill.dataset.group;
      const value = pill.dataset.value;

      if (group === "break") {
        if (state.breakBehavior.includes(value)) {
          state.breakBehavior = state.breakBehavior.filter((v) => v !== value);
          pill.classList.remove("selected");
        } else {
          state.breakBehavior.push(value);
          pill.classList.add("selected");
        }
      } else if (group === "tone") {
        if (state.emotionalTone.includes(value)) {
          state.emotionalTone = state.emotionalTone.filter((v) => v !== value);
          pill.classList.remove("selected");
        } else if (state.emotionalTone.length < 3) {
          state.emotionalTone.push(value);
          pill.classList.add("selected");
        } else {
          showToast("Pick up to 3 emotional tones.");
        }
      }
    });
  });
}

// Info panel toggles
function initInfoPanels() {
  document.querySelectorAll(".info-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.target;
      const panel = document.getElementById(targetId);
      if (!panel) return;
      const isOpen = panel.classList.contains("open");
      // Close all panels
      document.querySelectorAll(".info-panel.open").forEach((p) => p.classList.remove("open"));
      document.querySelectorAll(".info-btn.active").forEach((b) => b.classList.remove("active"));
      // Toggle clicked one
      if (!isOpen) {
        panel.classList.add("open");
        btn.classList.add("active");
      }
    });
  });
}

// Context textarea
function initContext() {
  const el = document.getElementById("context-input");
  if (el) el.addEventListener("input", () => { state.context = el.value; });
}

// ── Find handler ─────────────────────────────────────────────
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
      additional_context: state.context,
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

// ── Render ───────────────────────────────────────────────────
function showEmptyState() {
  resultsPanel.innerHTML = `
    <div class="empty-state">
      <div class="icon">🎧</div>
      <h2>Set your vibe, find your groove</h2>
      <p>Dial in the 7 dance descriptors and Claude will curate songs that match your WCS musicality goals.</p>
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
  resultsPanel.innerHTML = `<div class="skeleton-cards">${cards}</div>`;
}

function renderResults(data) {
  const { recommendations = [], curator_note = "" } = data;

  const noteHtml = curator_note
    ? `<div class="curator-note"><strong>Curator's Note</strong>${escHtml(curator_note)}</div>`
    : "";

  const cardsHtml = recommendations.map((song, i) => renderCard(song, i)).join("");

  resultsPanel.innerHTML = `
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

  return `
    <div class="song-card" style="animation-delay: ${delay}s">
      <div class="song-number">Track ${String(index + 1).padStart(2, "0")}</div>
      <div class="song-title">${escHtml(title)}</div>
      <div class="song-artist">${escHtml(artist)}</div>

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
      </div>
    </div>`;
}

// ── Utilities ────────────────────────────────────────────────
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
