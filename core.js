export function formatTime(value) {
  const seconds = Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const whole = Math.floor(seconds % 60);
  const millis = Math.round((seconds - Math.floor(seconds)) * 1000);
  return [hours, minutes, whole].map((part) => String(part).padStart(2, "0")).join(":") + `.${String(millis).padStart(3, "0")}`;
}

export function parseTime(value) {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (/^\d+(\.\d+)?$/.test(raw)) return Number(raw);
  const parts = raw.split(":");
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !/^\d+(\.\d+)?$/.test(part))) return null;
  const numbers = parts.map(Number);
  const seconds = numbers.pop();
  const minutes = numbers.pop();
  const hours = numbers.pop() ?? 0;
  if (minutes >= 60 || seconds >= 60) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

export function buildPayloads(meta, segments) {
  return Object.entries(segments).flatMap(([segment_type, segment]) => {
    const start = parseTime(segment.start);
    const end = parseTime(segment.end);
    if (start === null || end === null || end <= start) return [];
    const payload = {
      segment_type,
      imdb_id: meta.imdb_id.trim(),
      season: Number(meta.season),
      episode: Number(meta.episode),
      start_sec: Number(start.toFixed(3)),
      end_sec: Number(end.toFixed(3)),
    };
    if (Number(meta.tvdb_id) > 0) payload.tvdb_id = Number(meta.tvdb_id);
    if (Number(meta.tmdb_id) > 0) payload.tmdb_id = Number(meta.tmdb_id);
    return [payload];
  });
}

export function validateMeta(meta) {
  if (!/^tt\d{7,8}$/.test(meta.imdb_id.trim())) return "Enter a valid IMDb ID (tt followed by 7 or 8 digits).";
  if (!Number.isInteger(Number(meta.season)) || Number(meta.season) < 1) return "Season must be 1 or higher.";
  if (!Number.isInteger(Number(meta.episode)) || Number(meta.episode) < 1) return "Episode must be 1 or higher.";
  return "";
}
