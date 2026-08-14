import { buildEpisodeGuide, buildPayloads, calculateIntroEnd, formatTime, getNextEpisode, mapTvmazeShows, parseTime, resolveIntroDuration, validateEpisodeInGuide, validateMeta } from "./core.js";

const types = [
  { id: "recap", accent: "#76a7ff", description: "Previously-on material before the episode begins." },
  { id: "intro", accent: "#d7ff45", description: "The title sequence, excluding cold opens and pre-roll." },
  { id: "outro", accent: "#ff6b3d", description: "Credits, ending before any post-credit scene." },
];
const segments = Object.fromEntries(types.map(({ id }) => [id, { start: "", end: "" }]));
const $ = (selector) => document.querySelector(selector);
const video = $("#video");
const fileInput = $("#file-input");
const emptyPlayer = $("#empty-player");
const dropZone = $("#drop-zone");
let objectUrl = "";
let toastTimer;
let searchResults = [];
let selectedShow = null;
let episodeGuide = { status: "idle", imdbId: "", tvmazeId: null, seasons: {} };
let episodeGuideRequest = 0;
let workflowMode = loadWorkflowMode();
const storageKey = "cutmark-library-v1";
const apiKeyStorageKey = "cutmark-introdb-api-key";
const proxyUrl = window.CUTMARK_CONFIG?.proxyUrl || "";
const library = loadLibrary();

function loadWorkflowMode() {
  try { return localStorage.getItem("cutmark-workflow") === "video" ? "video" : "manual"; }
  catch { return "manual"; }
}

function loadLibrary() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
    return { bookmarks: Array.isArray(saved.bookmarks) ? saved.bookmarks : [], defaults: saved.defaults && typeof saved.defaults === "object" ? saved.defaults : {} };
  } catch {
    return { bookmarks: [], defaults: {} };
  }
}

function saveLibrary() {
  try { localStorage.setItem(storageKey, JSON.stringify(library)); }
  catch { toast("This browser could not save local preferences"); }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function renderCards() {
  $("#marker-grid").innerHTML = types.map(({ id, accent, description }, index) => `
    <article class="marker-card" style="--accent:${accent}">
      <p class="step">0${index + 1}</p>
      <h3>${id}</h3>
      <p class="description">${description}</p>
      ${["start", "end"].map((boundary) => `
        <div class="time-field">
          <label for="${id}-${boundary}"><span>${boundary}</span><span>${boundary === "start" ? "A" : "B"}</span></label>
          <div class="time-entry">
            <input id="${id}-${boundary}" data-type="${id}" data-boundary="${boundary}" inputmode="decimal" placeholder="00:00:00.000" aria-label="${id} ${boundary} time" />
            <button type="button" data-capture="${id}:${boundary}">Use now</button>
          </div>
        </div>`).join("")}
      <div class="card-footer"><span class="segment-status" id="${id}-status">Not marked</span><button class="clear-button" type="button" data-clear="${id}">Clear</button></div>
    </article>`).join("");
}

function metadata() {
  return {
    imdb_id: $("#imdb-id").value,
    season: $("#season").value,
    episode: $("#episode").value,
    tvdb_id: $("#tvdb-id").value,
    tmdb_id: $("#tmdb-id").value,
  };
}

function renderBookmarks() {
  const container = $("#saved-shows");
  container.hidden = library.bookmarks.length === 0;
  $("#bookmark-list").innerHTML = library.bookmarks.map((show) => `<button class="bookmark-chip${show.imdbId === metadata().imdb_id ? " active" : ""}" type="button" data-bookmark-id="${escapeHtml(show.imdbId)}">${escapeHtml(show.name)}</button>`).join("");
}

function renderSelectedShow() {
  const panel = $("#selected-show");
  if (!selectedShow) { panel.hidden = true; return; }
  panel.hidden = false;
  $("#selected-title").textContent = selectedShow.name;
  $("#selected-meta").textContent = [selectedShow.premiered?.slice(0, 4), selectedShow.imdbId].filter(Boolean).join(" · ");
  const poster = $("#selected-poster");
  poster.hidden = !selectedShow.image;
  if (selectedShow.image) poster.src = selectedShow.image;
  poster.alt = selectedShow.image ? `${selectedShow.name} poster` : "";
  const saved = library.bookmarks.some((show) => show.imdbId === selectedShow.imdbId);
  $("#bookmark-show").textContent = saved ? "★" : "☆";
  $("#bookmark-show").classList.toggle("saved", saved);
  $("#bookmark-show").setAttribute("aria-label", saved ? `Remove ${selectedShow.name} bookmark` : `Bookmark ${selectedShow.name}`);
}

function selectShow(show) {
  selectedShow = show;
  $("#imdb-id").value = show.imdbId;
  $("#tvdb-id").value = show.tvdbId || "";
  $("#show-search").value = show.name;
  $("#search-results").hidden = true;
  renderSelectedShow();
  renderBookmarks();
  updateDefaultUI();
  loadEpisodeGuide(show);
  updateOutput();
}

function setEpisodeGuideStatus(status, message) {
  episodeGuide.status = status;
  const panel = $("#episode-guide");
  panel.dataset.state = status === "ready" ? (episodeGuideError() ? "error" : "valid") : status === "unavailable" ? "error" : status;
  $("#episode-guide-status").textContent = message;
}

function episodeGuideError(meta = metadata()) {
  if (episodeGuide.status === "loading" && episodeGuide.imdbId === meta.imdb_id.trim()) return "The episode guide is still loading.";
  if (episodeGuide.status === "unavailable" && episodeGuide.imdbId === meta.imdb_id.trim()) return "The episode guide is unavailable; direct submission is paused.";
  if (episodeGuide.status !== "ready" || episodeGuide.imdbId !== meta.imdb_id.trim()) return "Select a show from title search to verify its episodes.";
  return validateEpisodeInGuide(episodeGuide.seasons, meta.season, meta.episode);
}

function renderEpisodeGuide() {
  if (episodeGuide.status === "loading") return setEpisodeGuideStatus("loading", "Loading verified seasons and episodes…");
  if (episodeGuide.status === "unavailable") return setEpisodeGuideStatus("unavailable", "Episode guide unavailable. Direct submission is paused; select the show from title search to retry.");
  if (episodeGuide.status !== "ready" || episodeGuide.imdbId !== metadata().imdb_id.trim()) return setEpisodeGuideStatus("idle", "Select a show from title search to verify its episodes.");

  const error = episodeGuideError();
  if (error) return setEpisodeGuideStatus("ready", error);
  const season = Number(metadata().season);
  const episode = Number(metadata().episode);
  const episodes = episodeGuide.seasons[String(season)];
  const next = getNextEpisode(episodeGuide.seasons, season, episode);
  $("#season").max = Math.max(...Object.keys(episodeGuide.seasons).map(Number));
  $("#episode").max = Math.max(...episodes);
  setEpisodeGuideStatus("ready", `S${season}E${episode} verified · ${episodes.length} episodes in season${next ? ` · next S${next.season}E${next.episode}` : " · final known episode"}`);
}

async function loadEpisodeGuide(show) {
  const requestId = ++episodeGuideRequest;
  const imdbId = show?.imdbId || metadata().imdb_id.trim();
  episodeGuide = { status: "loading", imdbId, tvmazeId: show?.tvmazeId || null, seasons: {} };
  renderEpisodeGuide();
  updateOutput();
  try {
    let tvmazeId = Number(show?.tvmazeId) || null;
    if (!tvmazeId && show?.name) {
      const search = await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(show.name)}`);
      if (!search.ok) throw new Error("Show lookup failed");
      const match = mapTvmazeShows(await search.json()).find((item) => item.imdbId === imdbId);
      tvmazeId = match?.tvmazeId || null;
    }
    if (!tvmazeId) throw new Error("No episode guide mapping");
    const response = await fetch(`https://api.tvmaze.com/shows/${tvmazeId}/episodes`);
    if (!response.ok) throw new Error("Episode guide failed");
    const seasons = buildEpisodeGuide(await response.json());
    if (!Object.keys(seasons).length) throw new Error("Episode guide is empty");
    if (requestId !== episodeGuideRequest || metadata().imdb_id.trim() !== imdbId) return;
    episodeGuide = { status: "ready", imdbId, tvmazeId, seasons };
    if (selectedShow?.imdbId === imdbId) selectedShow.tvmazeId = tvmazeId;
    const bookmark = library.bookmarks.find((item) => item.imdbId === imdbId);
    if (bookmark && bookmark.tvmazeId !== tvmazeId) { bookmark.tvmazeId = tvmazeId; saveLibrary(); }
    const currentError = validateEpisodeInGuide(seasons, metadata().season, metadata().episode);
    if (currentError) {
      const firstSeason = Math.min(...Object.keys(seasons).map(Number));
      $("#season").value = firstSeason;
      $("#episode").value = seasons[String(firstSeason)][0];
    }
    renderEpisodeGuide();
    updateDefaultUI();
    updateOutput();
  } catch {
    if (requestId !== episodeGuideRequest) return;
    episodeGuide = { status: "unavailable", imdbId, tvmazeId: null, seasons: {} };
    renderEpisodeGuide();
    updateOutput();
  }
}

async function resolveManualEpisodeGuide() {
  const imdbId = metadata().imdb_id.trim();
  const query = $("#show-search").value.trim();
  if (!/^tt\d{7,8}$/.test(imdbId) || query.length < 2) {
    episodeGuide = { status: "unavailable", imdbId, tvmazeId: null, seasons: {} };
    renderEpisodeGuide();
    updateOutput();
    return;
  }
  try {
    const response = await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error("Search failed");
    const match = mapTvmazeShows(await response.json()).find((show) => show.imdbId === imdbId);
    if (!match) throw new Error("No matching show");
    selectedShow = match;
    renderSelectedShow();
    await loadEpisodeGuide(match);
  } catch {
    episodeGuide = { status: "unavailable", imdbId, tvmazeId: null, seasons: {} };
    renderEpisodeGuide();
    updateOutput();
  }
}

async function searchShows() {
  const query = $("#show-search").value.trim();
  if (query.length < 2) return toast("Enter at least two letters");
  const panel = $("#search-results");
  panel.hidden = false;
  panel.innerHTML = '<p class="search-message">Searching…</p>';
  $("#search-shows").disabled = true;
  try {
    const response = await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error(`Search returned ${response.status}`);
    searchResults = mapTvmazeShows(await response.json());
    if (!searchResults.length) {
      panel.innerHTML = '<p class="search-message">No shows with an IMDb ID found. Try another title.</p>';
      return;
    }
    panel.innerHTML = searchResults.map((show, index) => `<button class="search-result" type="button" data-result-index="${index}">
      ${show.image ? `<img src="${escapeHtml(show.image)}" alt="" />` : '<span aria-hidden="true"></span>'}
      <span><strong>${escapeHtml(show.name)}</strong><span>${escapeHtml([show.premiered?.slice(0, 4), show.network].filter(Boolean).join(" · "))}</span></span>
      <code>${escapeHtml(show.imdbId)}</code>
    </button>`).join("");
  } catch {
    panel.innerHTML = '<p class="search-message">Title search is unavailable right now. You can still enter the IMDb ID manually.</p>';
  } finally {
    $("#search-shows").disabled = false;
  }
}

function activeIntroDefault() {
  return resolveIntroDuration(library.defaults, metadata().imdb_id.trim(), metadata().season);
}

function updateDefaultUI() {
  const active = activeIntroDefault();
  $("#active-default").textContent = active ? `${active.seconds}s · ${active.scope === "season" ? `season ${metadata().season}` : "whole show"}` : "No default set";
  $("#remove-default").hidden = !active;
}

function applyIntroDefault(announce = false) {
  const active = activeIntroDefault();
  const end = active && calculateIntroEnd(segments.intro.start, active.seconds);
  if (end === null) return false;
  const value = formatTime(end);
  segments.intro.end = value;
  $("#intro-end").value = value;
  if (announce) toast(`Intro end set ${active.seconds}s after its start`);
  updateOutput();
  return true;
}

function updateOutput() {
  for (const { id } of types) {
    const start = parseTime(segments[id].start);
    const end = parseTime(segments[id].end);
    const status = $(`#${id}-status`);
    status.className = "segment-status";
    if (start === null && end === null) status.textContent = "Not marked";
    else if (start === null || end === null) status.textContent = "Needs both bounds";
    else if (end <= start) { status.textContent = "End must follow start"; status.classList.add("error"); }
    else { status.textContent = `${formatTime(end - start)} long`; status.classList.add("valid"); }
  }

  const meta = metadata();
  const metaError = validateMeta(meta);
  const guideError = episodeGuideError(meta);
  const payloads = buildPayloads(meta, segments);
  const enabled = payloads.length > 0 && !metaError;
  ["#copy-json", "#copy-curl", "#download-json", "#create-issue"].forEach((id) => { $(id).disabled = !enabled; });
  $("#submit-introdb").disabled = !enabled || Boolean(guideError) || !validApiKey($("#api-key").value) || !proxyUrl;
  $("#payload-preview").textContent = payloads.length ? JSON.stringify(payloads.length === 1 ? payloads[0] : payloads, null, 2) : "No complete segments yet.";
  $("#payload-summary").textContent = metaError && payloads.length ? metaError : guideError && payloads.length ? guideError : payloads.length ? `${payloads.length} valid ${payloads.length === 1 ? "segment" : "segments"} ready for IntroDB.` : "Complete a segment to create an IntroDB payload.";
}

function validApiKey(value) {
  return /^idb_[A-Za-z0-9_-]{8,}$/.test(String(value || "").trim());
}

function setConnectionStatus(message, state = "") {
  const status = $("#connection-status");
  status.textContent = message;
  status.className = `connection-status${state ? ` ${state}` : ""}`;
}

function loadApiKey() {
  const remembered = localStorage.getItem(apiKeyStorageKey) || "";
  const session = sessionStorage.getItem(apiKeyStorageKey) || "";
  $("#api-key").value = remembered || session;
  $("#remember-key").checked = Boolean(remembered);
  if (!proxyUrl) setConnectionStatus("The submission relay has not been deployed yet.", "error");
  else if (validApiKey($("#api-key").value)) setConnectionStatus("Key ready. It will be sent only when you submit.", "success");
}

function persistApiKey() {
  const key = $("#api-key").value.trim();
  if (!key) {
    localStorage.removeItem(apiKeyStorageKey);
    sessionStorage.removeItem(apiKeyStorageKey);
  } else if ($("#remember-key").checked) {
    localStorage.setItem(apiKeyStorageKey, key);
    sessionStorage.removeItem(apiKeyStorageKey);
  } else {
    sessionStorage.setItem(apiKeyStorageKey, key);
    localStorage.removeItem(apiKeyStorageKey);
  }
  if (key && !validApiKey(key)) setConnectionStatus("That key does not look like an IntroDB key (idb_…).", "error");
  else if (key) setConnectionStatus("Key ready. It will be sent only when you submit.", "success");
  else setConnectionStatus("Enter your key to enable direct submission.");
  updateOutput();
}

async function submitToIntroDB() {
  const payloads = payloadsOrWarn();
  if (!payloads) return;
  const guideError = episodeGuideError();
  if (guideError) return toast(guideError);
  const submittedEpisode = { season: Number(metadata().season), episode: Number(metadata().episode) };
  const key = $("#api-key").value.trim();
  if (!validApiKey(key)) return toast("Enter a valid IntroDB API key first");
  const button = $("#submit-introdb");
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Submitting…";
  setConnectionStatus("Sending timestamps to IntroDB…");
  try {
    const response = await fetch(proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-IntroDB-Key": key },
      body: JSON.stringify({ submissions: payloads }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || "IntroDB rejected the submission.");
    const accepted = result.results?.filter((item) => item.ok).length || payloads.length;
    const next = getNextEpisode(episodeGuide.seasons, submittedEpisode.season, submittedEpisode.episode);
    prepareAfterSubmission(next);
    setConnectionStatus(next
      ? `${accepted} ${accepted === 1 ? "segment" : "segments"} submitted. Moved to S${next.season}E${next.episode}.`
      : `${accepted} ${accepted === 1 ? "segment" : "segments"} submitted. This is the final known episode.`, "success");
    toast(next ? `Submitted · now on S${next.season}E${next.episode}` : "Submitted · final known episode");
  } catch (error) {
    setConnectionStatus(error.message || "Submission failed. Try the cURL fallback.", "error");
    toast("Submission failed");
  } finally {
    button.textContent = originalLabel;
    updateOutput();
  }
}

function clearAllSegments() {
  for (const { id } of types) {
    segments[id] = { start: "", end: "" };
    $(`#${id}-start`).value = "";
    $(`#${id}-end`).value = "";
  }
}

function unloadVideo() {
  video.pause();
  video.removeAttribute("src");
  video.load();
  video.hidden = true;
  emptyPlayer.hidden = false;
  fileInput.value = "";
  $("#current-time").textContent = "00:00:00.000";
  $("#duration").textContent = "/ 00:00:00.000";
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = "";
}

function prepareAfterSubmission(next) {
  clearAllSegments();
  if (workflowMode === "video") unloadVideo();
  if (next) {
    $("#season").value = next.season;
    $("#episode").value = next.episode;
  }
  updateDefaultUI();
  renderEpisodeGuide();
  updateOutput();
}

function loadFile(file) {
  if (!file) return;
  setWorkflowMode("video");
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(file);
  video.src = objectUrl;
  video.hidden = false;
  emptyPlayer.hidden = true;
  video.load();
  toast(`Loaded ${file.name}`);
}

function setWorkflowMode(mode, scroll = false) {
  workflowMode = mode === "video" ? "video" : "manual";
  try { localStorage.setItem("cutmark-workflow", workflowMode); } catch { /* The mode still works for this visit. */ }
  $("#workspace").classList.toggle("manual-mode", workflowMode === "manual");
  document.body.classList.toggle("manual-workflow", workflowMode === "manual");
  document.querySelectorAll("[data-workflow]").forEach((button) => {
    const active = button.dataset.workflow === workflowMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  $("#episode-copy").textContent = workflowMode === "manual"
    ? "Search by title to resolve the IMDb ID, or enter it directly."
    : "Identify the episode, then use the player to capture its boundaries.";
  $("#marker-help").textContent = workflowMode === "manual"
    ? "Type the timestamps you already know. Accepted formats include seconds, mm:ss, and hh:mm:ss."
    : "Pause at a boundary and choose Use now, or type any timestamp manually if the file cannot be resolved.";
  if (scroll) $("#workspace").scrollIntoView({ behavior: "smooth", block: "start" });
}

function capture(type, boundary) {
  if (!video.src) return toast("Choose a media file first");
  const value = formatTime(video.currentTime);
  segments[type][boundary] = value;
  $(`#${type}-${boundary}`).value = value;
  if (type === "intro" && boundary === "start") applyIntroDefault(true);
  updateOutput();
}

function payloadsOrWarn() {
  const error = validateMeta(metadata());
  if (error) { toast(error); return null; }
  return buildPayloads(metadata(), segments);
}

async function copyText(text, message) {
  try { await navigator.clipboard.writeText(text); toast(message); }
  catch { toast("Clipboard access was blocked"); }
}

function makeCurl(payloads) {
  return payloads.map((payload) => `curl https://api.introdb.app/submit \\\n  -X POST \\\n  -H "Content-Type: application/json" \\\n  -H "X-API-Key: $INTRODB_API_KEY" \\\n  --data '${JSON.stringify(payload)}'`).join("\n\n");
}

function inferredRepo() {
  const hostParts = location.hostname.split(".");
  const pathParts = location.pathname.split("/").filter(Boolean);
  return hostParts[1] === "github" && pathParts[0] ? `${hostParts[0]}/${pathParts[0]}` : "";
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("show"), 2400);
}

renderCards();
setWorkflowMode(workflowMode);
renderBookmarks();
renderEpisodeGuide();
updateDefaultUI();
loadApiKey();
updateOutput();

$("#api-key").addEventListener("input", persistApiKey);
$("#remember-key").addEventListener("change", persistApiKey);
$("#toggle-key").addEventListener("click", () => {
  const input = $("#api-key");
  const showing = input.type === "text";
  input.type = showing ? "password" : "text";
  $("#toggle-key").textContent = showing ? "Show" : "Hide";
  $("#toggle-key").setAttribute("aria-label", showing ? "Show API key" : "Hide API key");
});
$("#clear-key").addEventListener("click", () => { $("#api-key").value = ""; persistApiKey(); });
$("#submit-introdb").addEventListener("click", submitToIntroDB);

$("#search-shows").addEventListener("click", searchShows);
document.querySelectorAll("[data-workflow]").forEach((button) => button.addEventListener("click", () => setWorkflowMode(button.dataset.workflow, true)));
$("#manual-fallback").addEventListener("click", () => setWorkflowMode("manual", true));
$("#show-search").addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); searchShows(); } });
$("#search-results").addEventListener("click", (event) => {
  const result = event.target.closest("[data-result-index]");
  if (result) selectShow(searchResults[Number(result.dataset.resultIndex)]);
});
$("#bookmark-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-bookmark-id]");
  if (!button) return;
  const show = library.bookmarks.find((item) => item.imdbId === button.dataset.bookmarkId);
  if (show) selectShow(show);
});
$("#bookmark-show").addEventListener("click", () => {
  if (!selectedShow) return;
  const index = library.bookmarks.findIndex((show) => show.imdbId === selectedShow.imdbId);
  if (index >= 0) { library.bookmarks.splice(index, 1); toast(`${selectedShow.name} removed from bookmarks`); }
  else { library.bookmarks.push(selectedShow); library.bookmarks.sort((a, b) => a.name.localeCompare(b.name)); toast(`${selectedShow.name} bookmarked`); }
  saveLibrary();
  renderSelectedShow();
  renderBookmarks();
});

$("#save-default").addEventListener("click", () => {
  const meta = metadata();
  if (!/^tt\d{7,8}$/.test(meta.imdb_id.trim())) return toast("Choose a show or enter its IMDb ID first");
  if (!Number.isInteger(Number(meta.season)) || Number(meta.season) < 1) return toast("Enter a valid season first");
  const seconds = Number($("#default-duration").value);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 900) return toast("Enter a duration between 1 and 900 seconds");
  const imdbId = meta.imdb_id.trim();
  library.defaults[imdbId] ||= { show: null, seasons: {} };
  if ($("#default-scope").value === "season") library.defaults[imdbId].seasons[String(meta.season)] = seconds;
  else library.defaults[imdbId].show = seconds;
  saveLibrary();
  updateDefaultUI();
  applyIntroDefault();
  toast(`Saved ${seconds}s intro default`);
});
$("#remove-default").addEventListener("click", () => {
  const meta = metadata();
  const active = activeIntroDefault();
  const rules = library.defaults[meta.imdb_id.trim()];
  if (!active || !rules) return;
  if (active.scope === "season") delete rules.seasons[String(meta.season)];
  else rules.show = null;
  if (!rules.show && Object.keys(rules.seasons || {}).length === 0) delete library.defaults[meta.imdb_id.trim()];
  saveLibrary();
  updateDefaultUI();
  toast("Intro default removed");
});

$("#choose-file").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => loadFile(fileInput.files[0]));
["dragenter", "dragover"].forEach((event) => dropZone.addEventListener(event, (e) => { e.preventDefault(); dropZone.classList.add("dragging"); }));
["dragleave", "drop"].forEach((event) => dropZone.addEventListener(event, (e) => { e.preventDefault(); dropZone.classList.remove("dragging"); }));
dropZone.addEventListener("drop", (event) => loadFile(event.dataTransfer.files[0]));

video.addEventListener("timeupdate", () => { $("#current-time").textContent = formatTime(video.currentTime); });
video.addEventListener("loadedmetadata", () => { $("#duration").textContent = `/ ${formatTime(video.duration)}`; });
video.addEventListener("play", () => { $("#play-toggle").textContent = "❚❚"; });
video.addEventListener("pause", () => { $("#play-toggle").textContent = "▶"; });
$("#play-toggle").addEventListener("click", () => video.src && (video.paused ? video.play() : video.pause()));
document.querySelectorAll("[data-seek]").forEach((button) => button.addEventListener("click", () => { if (video.src) video.currentTime = Math.max(0, video.currentTime + Number(button.dataset.seek)); }));

$("#marker-grid").addEventListener("click", (event) => {
  const captureButton = event.target.closest("[data-capture]");
  const clearButton = event.target.closest("[data-clear]");
  if (captureButton) capture(...captureButton.dataset.capture.split(":"));
  if (clearButton) {
    const type = clearButton.dataset.clear;
    segments[type] = { start: "", end: "" };
    $(`#${type}-start`).value = "";
    $(`#${type}-end`).value = "";
    updateOutput();
  }
});
$("#marker-grid").addEventListener("input", (event) => {
  const input = event.target.closest("[data-boundary]");
  if (!input) return;
  segments[input.dataset.type][input.dataset.boundary] = input.value;
  updateOutput();
});
$("#intro-start").addEventListener("change", () => applyIntroDefault(true));
document.querySelectorAll("#imdb-id, #season, #episode, #tvdb-id, #tmdb-id").forEach((input) => input.addEventListener("input", () => {
  if (input.id === "imdb-id" && selectedShow?.imdbId !== input.value.trim()) {
    selectedShow = null;
    episodeGuideRequest += 1;
    episodeGuide = { status: "idle", imdbId: input.value.trim(), tvmazeId: null, seasons: {} };
    renderSelectedShow();
  }
  if (input.id === "imdb-id" || input.id === "season") { updateDefaultUI(); renderBookmarks(); }
  if (input.id === "imdb-id" || input.id === "season" || input.id === "episode") renderEpisodeGuide();
  updateOutput();
}));
$("#imdb-id").addEventListener("change", resolveManualEpisodeGuide);
$("#season").addEventListener("change", () => {
  if (episodeGuide.status !== "ready") return;
  const episodes = episodeGuide.seasons[String(Number($("#season").value))];
  if (episodes && !episodes.includes(Number($("#episode").value))) $("#episode").value = episodes[0];
  updateDefaultUI();
  renderEpisodeGuide();
  updateOutput();
});

document.addEventListener("keydown", (event) => {
  if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName) || !video.src) return;
  if (event.code === "Space") { event.preventDefault(); video.paused ? video.play() : video.pause(); }
  if (event.key === "ArrowLeft") { event.preventDefault(); video.currentTime = Math.max(0, video.currentTime - 5); }
  if (event.key === "ArrowRight") { event.preventDefault(); video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 5); }
});

$("#copy-json").addEventListener("click", () => { const payloads = payloadsOrWarn(); if (payloads) copyText(JSON.stringify(payloads.length === 1 ? payloads[0] : payloads, null, 2), "IntroDB JSON copied"); });
$("#copy-curl").addEventListener("click", () => { const payloads = payloadsOrWarn(); if (payloads) copyText(makeCurl(payloads), "cURL command copied"); });
$("#download-json").addEventListener("click", () => {
  const payloads = payloadsOrWarn();
  if (!payloads) return;
  const blob = new Blob([JSON.stringify(payloads, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href: url, download: `${metadata().imdb_id}-s${metadata().season}e${metadata().episode}-segments.json` });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
});
$("#create-issue").addEventListener("click", () => {
  const payloads = payloadsOrWarn();
  if (!payloads) return;
  const repo = inferredRepo();
  if (!repo) return toast("Review issues become available on the GitHub Pages site");
  const title = `Segments: ${metadata().imdb_id} S${metadata().season}E${metadata().episode}`;
  const body = `## IntroDB segment submission\n\n\`\`\`json\n${JSON.stringify(payloads, null, 2)}\n\`\`\`\n\n> Generated locally with Cutmark. Please verify these boundaries before submitting to IntroDB.`;
  window.open(`https://github.com/${repo}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=timestamp-submission`, "_blank", "noopener");
});

window.addEventListener("beforeunload", () => { if (objectUrl) URL.revokeObjectURL(objectUrl); });
