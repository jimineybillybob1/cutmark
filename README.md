# Cutmark

A lightweight, privacy-first timestamp marker for contributing recap, intro, and outro segments to [IntroDB](https://introdb.app/docs/api).

Cutmark runs entirely in the browser. Media files are opened with a local object URL and are never uploaded. It generates valid IntroDB API payloads, cURL commands, JSON downloads, and prefilled GitHub review issues.

It also supports title search through TVmaze, device-local show bookmarks, and intro-duration shortcuts scoped to a whole show or one season. A season rule takes precedence over its show's general rule. For example, a saved 50-second season rule turns an intro start at `00:00:30` into an end at `00:01:20` automatically.

There are two interchangeable timestamping workflows: search for a show and enter known times manually, or load a local video and capture boundaries from its current playback position. Manual entry remains available in video mode when the browser cannot decode a file.

Direct submission requires an episode verified against TVmaze's regular-episode guide. After a successful submission, Cutmark clears the timestamps and advances to the next confirmed episode, including crossing into the next known season. At the final known episode it clears the completed timestamps without inventing another episode number.

For the selected season, Cutmark fetches a cached coverage summary through the Worker and shows at a glance which episodes currently have intro, recap, and outro data in IntroDB. Coverage reads are public and do not send the contributor's API key.

Bookmarks and duration rules are saved in that browser's local storage. They survive reloads but do not sync between browsers or devices.

## Run locally

Any static file server works. For example:

```sh
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Direct submission

IntroDB permits browser API requests only from its own origin, so Cutmark uses a narrowly scoped Cloudflare Worker relay. Contributors supply their own IntroDB API key. The key is stored in session storage by default (or local storage only when explicitly requested), passes through the relay at submission time, and is never stored by the Worker.

The Worker accepts requests only from Cutmark's GitHub Pages origin, validates the payload, and forwards only to IntroDB's `/submit` endpoint. Deploy it with `wrangler deploy --config worker/wrangler.toml`, then set its `/submit` URL in `config.js`.

## Deploy

The included GitHub Actions workflow deploys the repository to GitHub Pages on pushes to `main`. In repository settings, set **Pages → Source** to **GitHub Actions**.

Cutmark is independent and is not affiliated with IntroDB.
