# Cutmark

A lightweight, privacy-first timestamp marker for contributing recap, intro, and outro segments to [IntroDB](https://introdb.app/docs/api).

Cutmark runs entirely in the browser. Media files are opened with a local object URL and are never uploaded. It generates valid IntroDB API payloads, cURL commands, JSON downloads, and prefilled GitHub review issues.

## Run locally

Any static file server works. For example:

```sh
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Why it does not submit directly

As of August 2026, `api.introdb.app` permits browser API requests only from `https://introdb.app`. A GitHub Pages origin therefore cannot call the API directly. Cutmark deliberately does not embed or collect API keys; it prepares requests for a trusted terminal or review workflow instead.

## Deploy

The included GitHub Actions workflow deploys the repository to GitHub Pages on pushes to `main`. In repository settings, set **Pages → Source** to **GitHub Actions**.

Cutmark is independent and is not affiliated with IntroDB.
