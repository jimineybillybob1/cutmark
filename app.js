import { buildPayloads, formatTime, parseTime, validateMeta } from "./core.js";

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
  const payloads = buildPayloads(meta, segments);
  const enabled = payloads.length > 0 && !metaError;
  ["#copy-json", "#copy-curl", "#download-json", "#create-issue"].forEach((id) => { $(id).disabled = !enabled; });
  $("#payload-preview").textContent = payloads.length ? JSON.stringify(payloads.length === 1 ? payloads[0] : payloads, null, 2) : "No complete segments yet.";
  $("#payload-summary").textContent = metaError && payloads.length ? metaError : payloads.length ? `${payloads.length} valid ${payloads.length === 1 ? "segment" : "segments"} ready for IntroDB.` : "Complete a segment to create an IntroDB payload.";
}

function loadFile(file) {
  if (!file) return;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(file);
  video.src = objectUrl;
  video.hidden = false;
  emptyPlayer.hidden = true;
  video.load();
  toast(`Loaded ${file.name}`);
}

function capture(type, boundary) {
  if (!video.src) return toast("Choose a media file first");
  const value = formatTime(video.currentTime);
  segments[type][boundary] = value;
  $(`#${type}-${boundary}`).value = value;
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
  return payloads.map((payload) => `curl https://api.introdb.app/submit \\\n+  -X POST \\\n+  -H "Content-Type: application/json" \\\n+  -H "X-API-Key: $INTRODB_API_KEY" \\\n+  --data '${JSON.stringify(payload)}'`).join("\n\n");
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
updateOutput();

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
document.querySelectorAll("#imdb-id, #season, #episode, #tvdb-id, #tmdb-id").forEach((input) => input.addEventListener("input", updateOutput));

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
