import test from "node:test";
import assert from "node:assert/strict";
import { buildPayloads, formatTime, parseTime, validateMeta } from "../core.js";

test("formats and parses timestamps", () => {
  assert.equal(formatTime(65.125), "00:01:05.125");
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
