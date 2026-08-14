import test from "node:test";
import assert from "node:assert/strict";
import { buildEpisodeGuide, buildPayloads, calculateIntroEnd, formatTime, getNextEpisode, mapTvmazeShows, parseTime, resolveIntroDuration, validateEpisodeInGuide, validateMeta } from "../core.js";

test("formats and parses timestamps", () => {
  assert.equal(formatTime(65.125), "00:01:05.125");
  assert.equal(formatTime(59.9996), "00:01:00.000");
  assert.equal(parseTime("01:05.125"), 65.125);
  assert.equal(parseTime("1:02:03"), 3723);
  assert.equal(parseTime("not-a-time"), null);
});

test("builds only complete valid segment payloads", () => {
  const payloads = buildPayloads(
    { imdb_id: "tt0903747", season: "1", episode: "2", tvdb_id: "81189", tmdb_id: "" },
    { intro: { start: "2.5", end: "58" }, recap: { start: "", end: "" }, outro: { start: "60", end: "59" } },
  );
  assert.deepEqual(payloads, [{ segment_type: "intro", imdb_id: "tt0903747", season: 1, episode: 2, start_sec: 2.5, end_sec: 58, tvdb_id: 81189 }]);
});

test("validates episode identity", () => {
  assert.equal(validateMeta({ imdb_id: "tt0903747", season: 1, episode: 1 }), "");
  assert.match(validateMeta({ imdb_id: "0903747", season: 1, episode: 1 }), /IMDb/);
});

test("season intro duration overrides the show duration", () => {
  const defaults = { tt0903747: { show: 45, seasons: { 4: 50 } } };
  assert.deepEqual(resolveIntroDuration(defaults, "tt0903747", 4), { seconds: 50, scope: "season" });
  assert.deepEqual(resolveIntroDuration(defaults, "tt0903747", 3), { seconds: 45, scope: "show" });
  assert.equal(resolveIntroDuration(defaults, "tt0000001", 4), null);
});

test("calculates an intro end from its start and saved duration", () => {
  assert.equal(calculateIntroEnd("00:00:30.000", 50), 80);
  assert.equal(calculateIntroEnd("bad", 50), null);
});

test("translates TVmaze results to IMDb-backed choices", () => {
  const results = mapTvmazeShows([
    { show: { id: 169, name: "Breaking Bad", premiered: "2008-01-20", externals: { imdb: "tt0903747", thetvdb: 81189 }, network: { name: "AMC" }, image: { medium: "poster.jpg" } } },
    { show: { name: "No IMDb mapping", externals: { imdb: null } } },
  ]);
  assert.deepEqual(results, [{ name: "Breaking Bad", imdbId: "tt0903747", tvmazeId: 169, tvdbId: 81189, image: "poster.jpg", premiered: "2008-01-20", network: "AMC" }]);
});

test("builds a regular-episode guide and validates selections", () => {
  const guide = buildEpisodeGuide([
    { season: 1, number: 2, type: "regular" },
    { season: 1, number: 1, type: "regular" },
    { season: 1, number: 99, type: "special" },
    { season: 2, number: 1, type: "regular" },
  ]);
  assert.deepEqual(guide, { 1: [1, 2], 2: [1] });
  assert.equal(validateEpisodeInGuide(guide, 1, 2), "");
  assert.match(validateEpisodeInGuide(guide, 1, 3), /not in season/i);
  assert.match(validateEpisodeInGuide(guide, 3, 1), /not in the verified/i);
});

test("advances within a season and then to the next known season", () => {
  const guide = { 1: [1, 2], 3: [1, 2] };
  assert.deepEqual(getNextEpisode(guide, 1, 1), { season: 1, episode: 2 });
  assert.deepEqual(getNextEpisode(guide, 1, 2), { season: 3, episode: 1 });
  assert.equal(getNextEpisode(guide, 3, 2), null);
  assert.equal(getNextEpisode(guide, 2, 1), null);
});
