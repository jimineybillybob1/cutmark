export function formatTime(value) {
  const seconds = Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  const totalMillis = Math.round(seconds * 1000);
  const hours = Math.floor(totalMillis / 3_600_000);
  const minutes = Math.floor((totalMillis % 3_600_000) / 60_000);
  const whole = Math.floor((totalMillis % 60_000) / 1000);
  const millis = totalMillis % 1000;
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

export function resolveIntroDuration(defaults, imdbId, season) {
  const rules = defaults?.[imdbId];
  if (!rules) return null;
  const seasonValue = Number(rules.seasons?.[String(season)]);
  if (Number.isFinite(seasonValue) && seasonValue > 0) return { seconds: seasonValue, scope: "season" };
  const showValue = Number(rules.show);
  if (Number.isFinite(showValue) && showValue > 0) return { seconds: showValue, scope: "show" };
  return null;
}

export function calculateIntroEnd(start, duration) {
  const startSeconds = parseTime(start);
  const durationSeconds = Number(duration);
  if (startSeconds === null || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  return Number((startSeconds + durationSeconds).toFixed(3));
}

export function mapTvmazeShows(results) {
  if (!Array.isArray(results)) return [];
  return results.flatMap((result) => {
    const show = result?.show;
    const imdbId = show?.externals?.imdb || "";
    if (!/^tt\d{7,8}$/.test(imdbId)) return [];
    return [{
      name: String(show.name || imdbId),
      imdbId,
      tvmazeId: Number(show.id) || null,
      tvdbId: Number(show.externals?.thetvdb) || null,
      image: show.image?.medium || "",
      premiered: show.premiered || "",
      network: show.network?.name || show.webChannel?.name || "",
    }];
  }).slice(0, 8);
}

export function buildEpisodeGuide(episodes) {
  if (!Array.isArray(episodes)) return {};
  const guide = {};
  for (const episode of episodes) {
    const season = Number(episode?.season);
    const number = Number(episode?.number);
    if (!Number.isInteger(season) || season < 1 || !Number.isInteger(number) || number < 1) continue;
    if (episode.type && episode.type !== "regular") continue;
    guide[String(season)] ||= [];
    if (!guide[String(season)].includes(number)) guide[String(season)].push(number);
  }
  for (const numbers of Object.values(guide)) numbers.sort((a, b) => a - b);
  return Object.fromEntries(Object.entries(guide).sort(([a], [b]) => Number(a) - Number(b)));
}

export function validateEpisodeInGuide(guide, season, episode) {
  const seasonNumber = Number(season);
  const episodeNumber = Number(episode);
  const episodes = guide?.[String(seasonNumber)];
  if (!episodes) return `Season ${seasonNumber} is not in the verified episode guide.`;
  if (!episodes.includes(episodeNumber)) return `Episode ${episodeNumber} is not in season ${seasonNumber}.`;
  return "";
}

export function getNextEpisode(guide, season, episode) {
  if (validateEpisodeInGuide(guide, season, episode)) return null;
  const seasonNumber = Number(season);
  const episodeNumber = Number(episode);
  const episodes = guide[String(seasonNumber)];
  const index = episodes.indexOf(episodeNumber);
  if (index < episodes.length - 1) return { season: seasonNumber, episode: episodes[index + 1] };
  const seasons = Object.keys(guide).map(Number).sort((a, b) => a - b);
  const seasonIndex = seasons.indexOf(seasonNumber);
  if (seasonIndex < seasons.length - 1) {
    const nextSeason = seasons[seasonIndex + 1];
    return { season: nextSeason, episode: guide[String(nextSeason)][0] };
  }
  return null;
}
