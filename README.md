# Free image hosting: GitHub Actions + ImgBB

Two features, one secret (`IMGBB_API_KEY`), no paid services.

1. **Repo uploads** – push images to `images/`; a GitHub Action uploads them to ImgBB and records URLs in `images.manifest.json`.
2. **Website uploads** – `public/` has an upload UI; it posts to `api/upload.js` (serverless), which holds the key and calls ImgBB.

```
Browser ──image bytes──▶ /api/upload (Vercel function, holds IMGBB_API_KEY) ──▶ api.imgbb.com
GitHub push ▶ Actions (secret IMGBB_API_KEY) ▶ scripts/upload-images.mjs ▶ api.imgbb.com ▶ images.manifest.json
```

## Free-tier limits that matter (verify current terms before relying on them)
- **GitHub Pages cannot run backend code or hold secrets.** Use it for the frontend only; the backend must be elsewhere.
- **Vercel Hobby** (suggested backend): free for non-commercial use; request bodies to functions are capped around 4.5 MB, so this project limits uploads to 4 MB; functions have cold starts (first request after idle is slower). Check https://vercel.com/pricing.
- **Rate limiting is best-effort**: the in-memory limiter resets on cold starts and isn't shared between instances. For stronger limits add a shared store (e.g. a free Upstash Redis tier) in `api/upload.js`.
- **ImgBB**: the API accepts files up to 32 MB per its docs. Storage/bandwidth/permanence aren't guaranteed; read https://imgbb.com/tos. Don't treat it as permanent archival storage. Optional `expiration` (60–15552000 s) is supported by `lib/imgbb.js`.
- **GitHub Actions**: free minutes apply (generous for public repos; limited for private).

## Part A – Repo auto-upload
1. Get a key at https://api.imgbb.com/ (free ImgBB account).
2. Create the GitHub repo, push this project.
3. Repo → Settings → Secrets and variables → Actions → **New repository secret**: name `IMGBB_API_KEY`, value = your key.
4. Repo → Actions tab → enable workflows if prompted. Settings → Actions → General → Workflow permissions: allow **Read and write** (the workflow also declares `contents: write`).
5. Add an image to `images/`, commit, push to `main`. Watch Actions → "Upload images to ImgBB".
6. First manual run / re-upload everything: Actions → workflow → **Run workflow** (tick *force* to re-upload).

Behaviour: unchanged files are skipped (by SHA-256); renamed/copied files with identical content reuse the existing URL; failed uploads are retried 3× for network/429/5xx errors, never recorded as successful, and the run is marked failed so you can re-run safely (finished uploads are skipped). Deleting or renaming a repo image **never** deletes it from ImgBB. The manifest commit uses `[skip ci]`, the `GITHUB_TOKEN` (which doesn't trigger workflows), and lives outside `images/` so it cannot loop.

### Manifest format (`images.manifest.json`)
```json
{ "version": 1, "images": { "images/cat.png": {
  "sha256": "…", "id": "…", "url": "https://i.ibb.co/…", "displayUrl": "…", "thumbUrl": "…",
  "width": 800, "height": 600, "size": 12345, "uploadedAt": "2026-10-22T10:00:00.000Z" } } }
```
Use it on a site: `https://raw.githubusercontent.com/<user>/<repo>/main/images.manifest.json`. ImgBB's `delete_url` is deliberately not stored (the repo may be public).

## Part B – Website uploads
**Deploy backend + frontend together (simplest):**
1. vercel.com → sign in with GitHub → **Add New Project** → import this repo.
2. Project → Settings → Environment Variables → add `IMGBB_API_KEY` (Production). Redeploy.
3. Open the Vercel URL, pick an image, Upload.

**Frontend on GitHub Pages instead:** deploy to Vercel as above (backend), set `endpoint` in `public/config.js` to `https://<your-app>.vercel.app/api/upload`, set env `ALLOWED_ORIGIN=https://<user>.github.io` in Vercel, and publish `public/` to Pages.

**Using the URL in your site:** after success the page dispatches `image-uploaded` (`event.detail.url`) and stores it in `window.imageUploader.lastUpload`. It is never shown to the user. To keep it tied to a user/record, set `UPLOAD_RECORD_WEBHOOK_URL` (server POSTs the record JSON to your endpoint) or edit `lib/records.js` to write to your database. Website records are fully separate from the repo manifest.

Server checks: POST only, origin allow-list, per-IP rate limit (default 10 per 10 min, `UPLOAD_RATE_LIMIT`), size cap enforced while streaming, file type from magic bytes (JPG/PNG/GIF/WebP), random server-generated filename, missing key → clear server log + generic 500 to the client.

## Local development
```
cp .env.example .env      # put your real key in .env (gitignored)
npm test                  # unit tests, no network
npm run upload:images     # repo upload script, loads .env via node --env-file (Node ≥ 20.6)
npm i -g vercel && vercel dev   # website + API locally (reads .env)
```
`.env` is **not** available to GitHub Actions or Vercel: set the secret/variable in each place.

## Checked vs. not checked
Checked: syntax of all JS, unit tests (type detection, ImgBB response parsing), and the upload script end-to-end against a mocked ImgBB (upload, skip, reuse, invalid file, missing key). **Not checked**: real calls to ImgBB, the Vercel deployment, and the live GitHub Actions run (no network here), so do the first test uploads yourself.
