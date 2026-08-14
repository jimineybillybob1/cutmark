import test from "node:test";
import assert from "node:assert/strict";
import worker, { summarizeSegments, validateSubmission } from "../worker/src/index.js";

const valid = { segment_type: "intro", imdb_id: "tt0903747", season: 1, episode: 1, start_sec: 30, end_sec: 80 };

test("worker validates IntroDB submissions", () => {
  assert.equal(validateSubmission(valid), "");
  assert.match(validateSubmission({ ...valid, end_sec: 20 }), /end/i);
  assert.match(validateSubmission({ ...valid, segment_type: "ad" }), /type/i);
});

test("worker summarizes IntroDB coverage without exposing timestamp details", () => {
  assert.deepEqual(summarizeSegments({ intro: { start_sec: 1 }, recap: null, outro: { start_sec: 100 } }, 4), {
    episode: 4, available: true, intro: true, recap: false, outro: true,
  });
});

test("worker returns season coverage for the requested episodes", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const episode = Number(new URL(url).searchParams.get("episode"));
    return new Response(JSON.stringify({ intro: episode === 1 ? { start_sec: 1 } : null, recap: null, outro: null }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const response = await worker.fetch(new Request("https://worker.example/coverage?imdb_id=tt0903747&season=1&episodes=1,2", {
      headers: { Origin: "https://jimineybillybob1.github.io" },
    }));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.episodes[0].intro, true);
    assert.equal(body.episodes[1].intro, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("worker rejects requests from other origins", async () => {
  const response = await worker.fetch(new Request("https://worker.example/submit", {
    method: "POST",
    headers: { Origin: "https://evil.example", "Content-Type": "application/json", "X-IntroDB-Key": "idb_12345678" },
    body: JSON.stringify({ submissions: [valid] }),
  }));
  assert.equal(response.status, 403);
});

test("worker forwards a valid submission without retaining the key", async () => {
  const originalFetch = globalThis.fetch;
  let forwarded;
  globalThis.fetch = async (_url, options) => {
    forwarded = options;
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const response = await worker.fetch(new Request("https://worker.example/submit", {
      method: "POST",
      headers: { Origin: "https://jimineybillybob1.github.io", "Content-Type": "application/json", "X-IntroDB-Key": "idb_12345678" },
      body: JSON.stringify({ submissions: [valid] }),
    }));
    assert.equal(response.status, 200);
    assert.equal(forwarded.headers["X-API-Key"], "idb_12345678");
    assert.deepEqual(JSON.parse(forwarded.body), valid);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
