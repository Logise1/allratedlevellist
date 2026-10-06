const DATA_URL = "rated_levels.jsonl";
const SCORES_URL = "scores.json";
const CATS_URL = "categories.json";
const ROW_H = 72;
const REFRESH_MS = 15000;

const FALLBACK_CATS = [
  { id: "auto", name: "Auto", slug: "auto", min: 0, max: 1.5 },
  { id: "easy", name: "Easy", slug: "easy", min: 1.5, max: 2.5 },
  { id: "normal", name: "Normal", slug: "normal", min: 2.5, max: 3.7 },
  { id: "hard", name: "Hard", slug: "hard", min: 3.7, max: 5.6 },
  { id: "harder", name: "Harder", slug: "harder", min: 5.6, max: 7.6 },
  { id: "insane", name: "Insane", slug: "insane", min: 7.6, max: 9.5 },
  { id: "demon-easy", name: "Easy Demon", slug: "demon-easy", min: 9.5, max: 11.2 },
  { id: "demon-medium", name: "Medium Demon", slug: "demon-medium", min: 11.2, max: 13 },
  { id: "demon-hard", name: "Hard Demon", slug: "demon-hard", min: 13, max: 15 },
  { id: "demon-insane", name: "Insane Demon", slug: "demon-insane", min: 15, max: 17.5 },
  { id: "demon-extreme", name: "Extreme Demon", slug: "demon-extreme", min: 17.5, max: 99 },
];

const OFFICIAL_SLUG = {
  Auto: "auto",
  Easy: "easy",
  Normal: "normal",
  Hard: "hard",
  Harder: "harder",
  Insane: "insane",
  "Easy Demon": "demon-easy",
  "Medium Demon": "demon-medium",
  "Hard Demon": "demon-hard",
  "Insane Demon": "demon-insane",
  "Extreme Demon": "demon-extreme",
  "N/A": "unrated",
};

const state = {
  levels: [],
  filtered: [],
  scores: {},
  categories: FALLBACK_CATS,
  scored: 0,
  category: "all",
  query: "",
  sort: "score-desc",
};

const els = {
  stats: document.getElementById("stats"),
  q: document.getElementById("q"),
  sort: document.getElementById("sort"),
  faces: document.getElementById("faces"),
  scroller: document.getElementById("scroller"),
  viewport: document.getElementById("viewport"),
  list: document.getElementById("list"),
  empty: document.getElementById("empty"),
  error: document.getElementById("error"),
  reload: document.getElementById("reload"),
  autoRefresh: document.getElementById("autoRefresh"),
  theme: document.getElementById("theme"),
  overlay: document.getElementById("overlay"),
  sheet: document.getElementById("sheet"),
};

function preferredTheme() {
  return localStorage.getItem("theme") || "light";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("theme", theme);
  els.theme.textContent = theme === "dark" ? "Modo claro" : "Modo oscuro";
}

function officialSlug(level) {
  return OFFICIAL_SLUG[level.difficulty] || "unrated";
}

function slugOf(level) {
  return officialSlug(level);
}

function categoryName(level) {
  return level.difficulty || "N/A";
}

function estimatedCategory(level) {
  return level.scoreInfo?.category || "";
}

function faceFile(level) {
  const slug = slugOf(level);
  let extra = "";
  if (level.mythic) extra = "-mythic";
  else if (level.legendary) extra = "-legendary";
  else if (level.epic) extra = "-epic";
  else if (level.featured) extra = "-featured";
  return `assets/difficulties/${slug}${extra}.png`;
}

function compact(n) {
  const x = Number(n) || 0;
  if (Math.abs(x) >= 1_000_000) return `${(x / 1_000_000).toFixed(1)}M`;
  if (Math.abs(x) >= 1_000) return `${(x / 1_000).toFixed(1)}k`;
  return String(x);
}

function fmtScore(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return Number(value).toFixed(4);
}

function showError(msg) {
  els.error.textContent = msg;
  els.error.classList.toggle("hidden", !msg);
}

function parseJsonl(text) {
  const levels = [];
  const seen = new Set();
  for (const line of text.split("\n")) {
    const raw = line.trim();
    if (!raw) continue;
    try {
      const item = JSON.parse(raw);
      const id = String(item.id || "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      levels.push(item);
    } catch {
      /* linea incompleta mientras se descarga */
    }
  }
  return levels;
}

function mergeScores(levels, scores) {
  return levels.map((level) => {
    const info = scores[String(level.id)];
    return info ? { ...level, scoreInfo: info, score: info.score } : { ...level, score: null };
  });
}

function assignRanks(levels) {
  const scored = levels
    .filter((level) => level.score != null)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return Number(a.id) - Number(b.id);
    });
  const rankOf = new Map(scored.map((level, i) => [String(level.id), i + 1]));
  return levels.map((level) => ({ ...level, rank: rankOf.get(String(level.id)) ?? null }));
}

function fmtRank(level) {
  return level.rank == null ? "N/A" : String(level.rank);
}

function applyFilters() {
  const q = state.query.trim().toLowerCase();
  let rows = state.levels;
  if (state.category !== "all") {
    rows = rows.filter((l) => slugOf(l) === state.category);
  }
  if (q) {
    rows = rows.filter((l) => {
      return (
        String(l.name || "").toLowerCase().includes(q) ||
        String(l.author || "").toLowerCase().includes(q) ||
        String(l.id || "").includes(q)
      );
    });
  }
  const key = state.sort;
  rows = rows.slice().sort((a, b) => {
    if (key === "name") return String(a.name || "").localeCompare(String(b.name || ""));
    if (key === "id") return Number(a.id) - Number(b.id);
    if (key === "score") {
      const as = a.score == null ? Infinity : a.score;
      const bs = b.score == null ? Infinity : b.score;
      if (as === bs) return Number(a.id) - Number(b.id);
      return as - bs;
    }
    if (key === "score-desc") {
      const as = a.score == null ? -Infinity : a.score;
      const bs = b.score == null ? -Infinity : b.score;
      if (as === bs) return Number(a.id) - Number(b.id);
      return bs - as;
    }
    return (Number(b[key]) || 0) - (Number(a[key]) || 0);
  });
  state.filtered = rows;
  els.viewport.style.height = `${rows.length * ROW_H}px`;
  els.empty.classList.toggle("hidden", rows.length > 0);
  paintVisible();
}

function paintFaces() {
  const counts = {};
  for (const level of state.levels) {
    const slug = slugOf(level);
    counts[slug] = (counts[slug] || 0) + 1;
  }
  els.faces.innerHTML = "";

  const all = document.createElement("button");
  all.className = `face-btn${state.category === "all" ? " on" : ""}`;
  all.type = "button";
  all.innerHTML = `<img src="assets/difficulties/easy.png" alt="" /><span>Todos (${state.levels.length})</span>`;
  all.addEventListener("click", () => {
    state.category = "all";
    paintFaces();
    applyFilters();
  });
  els.faces.append(all);

  for (const cat of state.categories) {
    const n = counts[cat.slug] || 0;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `face-btn${state.category === cat.slug ? " on" : ""}`;
    btn.title = cat.name;
    btn.innerHTML = `<img src="assets/difficulties/${cat.slug}.png" alt="" /><span>${cat.name} (${n})</span>`;
    btn.addEventListener("click", () => {
      state.category = state.category === cat.slug ? "all" : cat.slug;
      paintFaces();
      applyFilters();
    });
    els.faces.append(btn);
  }
}

function thumbUrl(level, size) {
  const base = `https://levelthumbs.prevter.me/thumbnail/${encodeURIComponent(level.id)}`;
  return size ? `${base}/${size}` : base;
}

function attachThumb(row, level) {
  const id = String(level.id);
  if (row.dataset.thumb === id) return;
  row.dataset.thumb = id;
  const url = thumbUrl(level, row.classList.contains("sheet") ? "" : "small");
  row.style.setProperty("--thumb", `url("${url}")`);
  const probe = new Image();
  probe.onload = () => row.classList.add("thumb-on");
  probe.src = url;
}

function rowHtml(level) {
  const ranked = level.rank != null;
  return `<button class="row has-thumb enter" type="button" data-id="${escapeHtml(level.id)}">
    <div class="rank${ranked ? "" : " na"}">${fmtRank(level)}</div>
    <img class="face" src="${faceFile(level)}" alt="" />
    <div>
      <div class="name">${escapeHtml(level.name || "???")}</div>
      <div class="sub">${escapeHtml(categoryName(level))}${level.featured ? " · Featured" : ""}${level.epic ? " · Epic" : ""}${level.legendary ? " · Legendary" : ""}${level.mythic ? " · Mythic" : ""}</div>
    </div>
    <div class="hide-sm">${escapeHtml(level.author || "—")}</div>
    <div class="score">${fmtScore(level.score)}</div>
    <div class="official hide-sm">${escapeHtml(level.difficulty || "—")} · ${level.stars || 0}★</div>
    <div class="hide-sm">${compact(level.likes)}</div>
    <div class="hide-sm">${compact(level.downloads)}</div>
  </button>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function paintVisible() {
  const top = els.scroller.scrollTop;
  const start = Math.max(0, Math.floor(top / ROW_H) - 1);
  const vis = Math.ceil(els.scroller.clientHeight / ROW_H) + 3;
  const end = Math.min(state.filtered.length, start + vis);
  const next = state.filtered.slice(start, end);

  const reuse = new Map();
  for (const node of els.list.children) reuse.set(node.dataset.id, node);

  const frag = document.createDocumentFragment();
  for (const level of next) {
    const id = String(level.id);
    let row = reuse.get(id);
    if (row) {
      row.classList.remove("enter");
      reuse.delete(id);
    } else {
      const wrap = document.createElement("div");
      wrap.innerHTML = rowHtml(level);
      row = wrap.firstElementChild;
    }
    attachThumb(row, level);
    frag.appendChild(row);
  }
  els.list.replaceChildren(frag);
  els.list.style.transform = `translateY(${start * ROW_H}px)`;
}

function badge(level) {
  const bits = [];
  if (level.featured) bits.push("Featured");
  if (level.epic) bits.push("Epic");
  if (level.legendary) bits.push("Legendary");
  if (level.mythic) bits.push("Mythic");
  if (level.platformer) bits.push("Platformer");
  return bits.join(" · ") || "Rateado";
}

function openDetails(level) {
  if (!level) return;
  const info = level.scoreInfo || {};
  const coins = "●".repeat(Number(level.coins) || 0) || "sin coins";
  els.sheet.classList.remove("thumb-on");
  delete els.sheet.dataset.thumb;
  attachThumb(els.sheet, level);
  els.sheet.innerHTML = `
    <div class="sheet-top">
      <img src="${faceFile(level)}" alt="" />
      <div>
        <h2 id="detail-title">${escapeHtml(level.name || "???")}</h2>
        <div class="meta">${escapeHtml(level.author || "—")} · ID ${escapeHtml(level.id)} · ${escapeHtml(badge(level))}</div>
      </div>
      <button class="icon-btn" type="button" data-close="1" aria-label="Cerrar">×</button>
    </div>
    <div class="grid">
      <div class="cell"><span>Rank</span><strong>${fmtRank(level)}</strong></div>
      <div class="cell"><span>Dificultad (dificultad.py)</span><strong>${fmtScore(level.score)}${estimatedCategory(level) ? ` · ${escapeHtml(estimatedCategory(level))}` : ""}</strong></div>
      <div class="cell"><span>Cara oficial</span><strong>${escapeHtml(level.difficulty || "—")} · ${level.stars || 0}★</strong></div>
      <div class="cell"><span>Objetos</span><strong>${compact(info.objects ?? level.objects)}</strong></div>
      <div class="cell"><span>Hazards</span><strong>${info.hazards == null ? "—" : compact(info.hazards)}</strong></div>
      <div class="cell"><span>Modos</span><strong>${escapeHtml(info.modos || "—")}</strong></div>
      <div class="cell"><span>Velocidad máx.</span><strong>${info.max_speed == null ? "—" : `${info.max_speed}x`}</strong></div>
      <div class="cell"><span>Likes</span><strong>${compact(level.likes)}</strong></div>
      <div class="cell"><span>Downloads</span><strong>${compact(level.downloads)}</strong></div>
      <div class="cell"><span>Duración</span><strong>${escapeHtml(level.length || "—")}</strong></div>
      <div class="cell"><span>Coins</span><strong>${escapeHtml(coins)}${level.verifiedCoins ? " · verificadas" : ""}</strong></div>
    </div>
    <p class="desc">${escapeHtml(level.description || "Sin descripción.")}</p>
    <div class="sheet-actions">
      <a href="https://gdbrowser.com/${encodeURIComponent(level.id)}" target="_blank" rel="noreferrer"><button type="button">Abrir en GDBrowser</button></a>
      <button class="ghost" type="button" data-close="1">Cerrar</button>
    </div>
  `;
  els.overlay.classList.remove("hidden");
}

function closeDetails() {
  els.overlay.classList.add("hidden");
}

async function fetchJson(url) {
  const res = await fetch(`${url}?t=${Date.now()}`);
  if (!res.ok) return null;
  return res.json();
}

async function loadList() {
  showError("");
  els.stats.textContent = "Cargando rated_levels.jsonl…";
  const res = await fetch(`${DATA_URL}?t=${Date.now()}`);
  if (!res.ok) throw new Error(`No pude leer ${DATA_URL} (${res.status}). Abre la carpeta con Live Server.`);
  const text = await res.text();
  const cats = await fetchJson(CATS_URL);
  const scoresPayload = await fetchJson(SCORES_URL);
  if (cats?.categories?.length) state.categories = cats.categories;
  state.scores = scoresPayload?.levels || {};
  state.scored = scoresPayload?.scored || Object.keys(state.scores).length;
  state.levels = assignRanks(mergeScores(parseJsonl(text), state.scores));
  const scoredBit = state.scored
    ? ` · ${state.scored.toLocaleString("es")} con score de dificultad.py`
    : " · sin scores.json todavía (python dificultad.py --from-db)";
  els.stats.textContent = `${state.levels.length.toLocaleString("es")} niveles${scoredBit}`;
  paintFaces();
  applyFilters();
}

applyTheme(preferredTheme());

els.q.addEventListener("input", () => {
  state.query = els.q.value;
  applyFilters();
});
els.sort.addEventListener("change", () => {
  state.sort = els.sort.value;
  applyFilters();
});
els.scroller.addEventListener("scroll", paintVisible, { passive: true });
window.addEventListener("resize", paintVisible);
els.reload.addEventListener("click", () => {
  loadList().catch((err) => showError(err.message));
});
els.theme.addEventListener("click", () => {
  applyTheme(preferredTheme() === "dark" ? "light" : "dark");
});
els.list.addEventListener("click", (event) => {
  const row = event.target.closest(".row");
  if (!row) return;
  const level = state.filtered.find((item) => String(item.id) === row.dataset.id);
  openDetails(level);
});
els.overlay.addEventListener("click", (event) => {
  if (event.target === els.overlay || event.target.closest("[data-close]")) closeDetails();
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeDetails();
});

setInterval(() => {
  if (!els.autoRefresh.checked) return;
  loadList().catch(() => {});
}, REFRESH_MS);

loadList().catch((err) => showError(err.message));
