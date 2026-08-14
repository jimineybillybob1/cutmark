const ALLOWED_ORIGINS = new Set([
  "https://jimineybillybob1.github.io",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
]);
const TYPES = new Set(["intro", "recap", "outro"]);
const UPSTREAM = "https://api.introdb.app/submit";

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-IntroDB-Key",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...corsHeaders(origin) },
  });
}

export function validateSubmission(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Submission must be an object.";
  if (!TYPES.has(value.segment_type)) return "Invalid segment type.";
  if (!/^tt\d{7,8}$/.test(value.imdb_id || "")) return "Invalid IMDb ID.";
  if (!Number.isInteger(value.season) || value.season < 1) return "Invalid season.";
  if (!Number.isInteger(value.episode) || value.episode < 1) return "Invalid episode.";
  if (!Number.isFinite(value.start_sec) || value.start_sec < 0) return "Invalid start time.";
  if (!Number.isFinite(value.end_sec) || value.end_sec <= value.start_sec) return "Invalid end time.";
  if (value.end_sec - value.start_sec > 900) return "Segment is too long.";
  if (value.tvdb_id != null && (!Number.isInteger(value.tvdb_id) || value.tvdb_id < 1)) return "Invalid TVDB ID.";
  if (value.tmdb_id != null && (!Number.isInteger(value.tmdb_id) || value.tmdb_id < 1)) return "Invalid TMDB ID.";
  return "";
}

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") || "";
    if (!ALLOWED_ORIGINS.has(origin)) return json({ ok: false, error: "Origin not allowed." }, 403, origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/submit") return json({ ok: false, error: "Not found." }, 404, origin);

    const apiKey = request.headers.get("X-IntroDB-Key") || "";
    if (!/^idb_[A-Za-z0-9_-]{8,}$/.test(apiKey)) return json({ ok: false, error: "A valid IntroDB API key is required." }, 401, origin);

    let body;
    try { body = await request.json(); }
    catch { return json({ ok: false, error: "Invalid JSON." }, 400, origin); }
    const submissions = body?.submissions;
    if (!Array.isArray(submissions) || submissions.length < 1 || submissions.length > 3) return json({ ok: false, error: "Send between one and three submissions." }, 400, origin);
    for (const submission of submissions) {
      const error = validateSubmission(submission);
      if (error) return json({ ok: false, error }, 400, origin);
    }

    const results = [];
    for (const submission of submissions) {
      try {
        const upstream = await fetch(UPSTREAM, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
          body: JSON.stringify(submission),
        });
        const responseBody = await upstream.json().catch(() => ({}));
        results.push({ ok: upstream.ok, status: upstream.status, segment_type: submission.segment_type, response: responseBody });
      } catch {
        results.push({ ok: false, status: 502, segment_type: submission.segment_type, response: { error: "IntroDB is unavailable." } });
      }
    }
    const ok = results.every((result) => result.ok);
    const error = ok ? undefined : results.find((result) => !result.ok)?.response?.error || "One or more submissions failed.";
    return json({ ok, results, ...(error ? { error } : {}) }, ok ? 200 : 502, origin);
  },
};
