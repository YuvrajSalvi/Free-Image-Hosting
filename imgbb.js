/*! imgbb.js — single-file ImgBB upload endpoint + upload widget. MIT License.
 *  Usage: copy this file in, set IMGBB_API_KEY, then add  <imgbb-upload></imgbb-upload><script src="/api/upload?widget"></script>
 *  Next.js: app/api/upload/route.js -> export { GET, POST, OPTIONS } from "../../../imgbb.js";  Cloudflare: export { default } from "./imgbb.js";
 *  Needs one env var: IMGBB_API_KEY.  Runs anywhere with Web-standard Request/Response
 *  (Next.js route handlers, Vercel, Cloudflare Workers, Netlify, Deno, Bun, Node 18+).
 *  GET  ?widget  -> the <imgbb-upload> web component    GET -> demo page
 *  POST (raw image bytes) -> { url, displayUrl, thumbUrl, width, height, mime }
 *  Optional env: MAX_UPLOAD_BYTES (default 4 MB), UPLOAD_RATE_LIMIT (default 10 per 10 min per IP),
 *                ALLOWED_ORIGIN (comma list, or *, for calls from other domains).            */

const IMGBB_ENDPOINT = 'https://api.imgbb.com/1/upload';
const WINDOW_MS = 10 * 60 * 1000;
const hits = new Map(); // best-effort limiter: per warm instance only

const getEnv = (env, k) => (env && env[k]) ?? (typeof process !== 'undefined' ? process.env[k] : undefined);

function detectType(b) {
  if (b.length < 12) return null;
  const s = (a, z) => String.fromCharCode(...b.subarray(a, z));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b[0] === 0x89 && s(1, 4) === 'PNG' && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return { mime: 'image/png', ext: 'png' };
  if (s(0, 6) === 'GIF87a' || s(0, 6) === 'GIF89a') return { mime: 'image/gif', ext: 'gif' };
  if (s(0, 4) === 'RIFF' && s(8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });

function corsHeaders(request, env) {
  const origin = request.headers.get('origin');
  if (!origin || origin === new URL(request.url).origin) return {};
  const allowed = (getEnv(env, 'ALLOWED_ORIGIN') || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!allowed.includes('*') && !allowed.includes(origin)) return null;
  return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
}

function rateLimited(request, limit) {
  const ip = (request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  const blocked = recent.length >= limit;
  if (!blocked) recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  return blocked;
}

export async function handler(request, env) {
  const cors = corsHeaders(request, env);
  if (cors === null) return json({ error: 'Origin not allowed.' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  if (request.method === 'GET') {
    const url = new URL(request.url);
    if (url.searchParams.has('widget'))
      return new Response(`(${widget})();`, { headers: { ...cors, 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
    return new Response(DEMO_PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405, cors);

  const IMGBB_API_KEY = getEnv(env, 'IMGBB_API_KEY');
  if (!IMGBB_API_KEY || IMGBB_API_KEY === 'your_actual_api_key_here') {
    console.error('imgbb-upload CONFIG ERROR: IMGBB_API_KEY is not set in the environment variables of this deployment.');
    return json({ error: 'Server is not configured for uploads.' }, 500, cors);
  }

  const max = Number(getEnv(env, 'MAX_UPLOAD_BYTES')) || 4 * 1024 * 1024;
  if (rateLimited(request, Number(getEnv(env, 'UPLOAD_RATE_LIMIT')) || 10)) return json({ error: 'Too many uploads. Try again later.' }, 429, cors);
  const tooBig = () => json({ error: `Image is too large (max ${Math.floor(max / 1048576)} MB).` }, 413, cors);
  if (Number(request.headers.get('content-length')) > max) return tooBig();

  let bytes;
  try { bytes = new Uint8Array(await request.arrayBuffer()); } catch { return json({ error: 'Could not read upload.' }, 400, cors); }
  if (bytes.length > max) return tooBig();
  const type = detectType(bytes); // real type from bytes, never from filename/header
  if (!type) return json({ error: 'Unsupported file. Use JPG, PNG, GIF or WebP.' }, 415, cors);

  const form = new FormData();
  form.append('image', toBase64(bytes));
  form.append('name', `${crypto.randomUUID()}.${type.ext}`);
  let res, body = null;
  try {
    res = await fetch(`${IMGBB_ENDPOINT}?key=${encodeURIComponent(IMGBB_API_KEY)}`, { method: 'POST', body: form });
    body = await res.json();
  } catch { if (!res) return json({ error: 'Image service unreachable. Try again.' }, 502, cors); }
  if (!res.ok || !body || body.success !== true || !body.data || !body.data.url) {
    console.error('imgbb-upload: ImgBB responded with HTTP', res.status);
    return res.status === 429 ? json({ error: 'Image service is busy. Try again shortly.' }, 503, cors) : json({ error: 'Upload was rejected by the image service.' }, 502, cors);
  }
  const d = body.data; // fields per https://api.imgbb.com/ ; delete_url is intentionally not returned
  return json({ url: d.url, displayUrl: d.display_url, thumbUrl: d.thumb && d.thumb.url, width: Number(d.width), height: Number(d.height), mime: type.mime }, 200, cors);
}

// Named + default exports so it drops into most platforms unchanged.
export const GET = handler, POST = handler, OPTIONS = handler;
export default { fetch: handler };

/* ---------- Browser widget: <imgbb-upload></imgbb-upload> (serialized and served via ?widget) ---------- */
function widget() {
  const script = document.currentScript;
  const base = script && script.src ? script.src.split('?')[0] : '/api/upload';
  class ImgbbUpload extends HTMLElement {
    connectedCallback() {
      const endpoint = this.getAttribute('endpoint') || base;
      const maxBytes = Number(this.getAttribute('max-mb') || 4) * 1048576;
      const types = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = '<style>:host{display:block;max-width:420px;font:16px system-ui,sans-serif}.drop{display:block;border:2px dashed #bbb;border-radius:12px;padding:24px 12px;text-align:center;cursor:pointer}.drop:focus-within,.drop.over{border-color:#5b4bdb}input{position:absolute;opacity:0;width:1px;height:1px}img{display:block;max-width:100%;max-height:300px;margin:12px auto 0;border-radius:8px}progress{width:100%;margin-top:10px}button{width:100%;margin-top:12px;padding:12px;font:inherit;font-weight:600;border:0;border-radius:10px;background:#5b4bdb;color:#fff;cursor:pointer}button:disabled{opacity:.5;cursor:not-allowed}p{min-height:1.4em;margin:8px 0 0}.error{color:#c62828}.ok{color:#1b7f3b}[hidden]{display:none}</style><label class="drop"><input type="file" accept="' + types.join(',') + '"><span>Tap to choose an image, or drop one here</span></label><img alt="Preview" hidden><progress max="100" hidden></progress><button type="button" disabled>Upload</button><p role="status" aria-live="polite"></p>';
      const $ = (s) => root.querySelector(s);
      const input = $('input'), drop = $('.drop'), img = $('img'), bar = $('progress'), btn = $('button'), msg = $('p');
      let file = null, objectUrl = null;
      const say = (t, c) => { msg.textContent = t; msg.className = c || ''; };
      const choose = (f) => {
        if (!f) return;
        if (!types.includes(f.type)) return say('Please choose a JPG, PNG, GIF or WebP image.', 'error');
        if (f.size > maxBytes) return say('That image is too large (max ' + Math.floor(maxBytes / 1048576) + ' MB).', 'error');
        file = f; if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = URL.createObjectURL(f); img.src = objectUrl; img.hidden = false; btn.disabled = false; say('');
      };
      input.addEventListener('change', () => choose(input.files[0]));
      ['dragover', 'dragenter'].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.add('over'); }));
      ['dragleave', 'drop'].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.remove('over'); }));
      drop.addEventListener('drop', (ev) => choose(ev.dataTransfer.files[0]));
      btn.addEventListener('click', () => {
        if (!file) return;
        const xhr = new XMLHttpRequest();
        const fail = (t) => { bar.hidden = true; btn.textContent = 'Upload'; btn.disabled = false; say(t, 'error'); };
        xhr.open('POST', endpoint); xhr.setRequestHeader('Content-Type', file.type); xhr.timeout = 90000;
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) bar.value = (e.loaded / e.total) * 100; };
        xhr.onerror = () => fail('Network error. Check your connection and try again.');
        xhr.ontimeout = () => fail('The upload timed out. Please try again.');
        xhr.onload = () => {
          let d = {}; try { d = JSON.parse(xhr.responseText); } catch (e) {}
          if (xhr.status !== 200 || !d.url) return fail(d.error || 'Upload failed. Please try again.');
          bar.hidden = true; btn.textContent = 'Upload'; img.src = d.displayUrl || d.url; say('Upload complete.', 'ok');
          this.lastUpload = d; file = null; input.value = '';
          this.dispatchEvent(new CustomEvent('uploaded', { detail: d, bubbles: true, composed: true })); // URL goes to your code, not the UI
        };
        bar.value = 0; bar.hidden = false; btn.disabled = true; btn.textContent = 'Uploading…'; say('');
        xhr.send(file);
      });
    }
  }
  if (!customElements.get('imgbb-upload')) customElements.define('imgbb-upload', ImgbbUpload);
}

const DEMO_PAGE = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Upload an image</title></head><body style="font-family:system-ui;padding:16px"><h1>Upload an image</h1><imgbb-upload></imgbb-upload><script src="?widget"></script></body></html>';
