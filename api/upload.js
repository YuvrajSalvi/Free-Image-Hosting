import { randomUUID } from 'node:crypto';
import { assertApiKey, ConfigError } from '../lib/config.js';
import { detectImageType } from '../lib/image-type.js';
import { uploadToImgbb, ImgbbError } from '../lib/imgbb.js';
import { saveUploadRecord } from '../lib/records.js';

// Raw binary body (no multipart parser needed). Vercel serverless request bodies cap near 4.5 MB.
export const config = { api: { bodyParser: false } };

const MAX_BYTES = Math.min(Number(process.env.MAX_UPLOAD_BYTES) || 4 * 1024 * 1024, 4.4 * 1024 * 1024);
const RATE_LIMIT = Number(process.env.UPLOAD_RATE_LIMIT) || 10; // uploads per window per IP
const WINDOW_MS = 10 * 60 * 1000;
const hits = new Map(); // best-effort, per warm instance only (see README)

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= RATE_LIMIT) { hits.set(ip, recent); return true; }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  return false;
}

function applyCors(req, res) {
  const allowed = (process.env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.origin;
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return true;
  }
  return !origin; // same-origin / non-browser requests carry no Origin header
}

async function readBody(req, limit) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) { const e = new Error('too large'); e.code = 'TOO_LARGE'; throw e; }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  const originOk = applyCors(req, res);
  if (req.method === 'OPTIONS') { res.statusCode = originOk ? 204 : 403; return res.end(); }
  if (!originOk) return send(res, 403, { error: 'Origin not allowed.' });
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' });

  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  if (rateLimited(ip)) return send(res, 429, { error: 'Too many uploads. Please try again later.' });

  const declared = Number(req.headers['content-length']);
  if (declared > MAX_BYTES) return send(res, 413, { error: `Image is too large (max ${Math.floor(MAX_BYTES / 1048576)} MB).` });

  try { assertApiKey(); } catch (err) {
    if (err instanceof ConfigError) {
      console.error('CONFIGURATION ERROR:', err.message);
      return send(res, 500, { error: 'Server is not configured for uploads.' });
    }
    throw err;
  }

  let body;
  try { body = await readBody(req, MAX_BYTES); } catch (err) {
    if (err.code === 'TOO_LARGE') return send(res, 413, { error: `Image is too large (max ${Math.floor(MAX_BYTES / 1048576)} MB).` });
    return send(res, 400, { error: 'Could not read upload.' });
  }

  const type = detectImageType(body);
  if (!type) return send(res, 415, { error: 'Unsupported file. Use JPG, PNG, GIF or WebP.' });

  try {
    const result = await uploadToImgbb(body, { name: `${randomUUID()}.${type.ext}` });
    await saveUploadRecord({ ...result, mime: type.mime, uploadedAt: new Date().toISOString() });
    // deleteUrl stays server-side on purpose.
    return send(res, 200, {
      url: result.url, displayUrl: result.displayUrl, thumbUrl: result.thumbUrl,
      width: result.width, height: result.height, mime: type.mime,
    });
  } catch (err) {
    console.error('Upload failed:', err.message);
    if (err instanceof ImgbbError && err.status === 429) return send(res, 503, { error: 'Image service is busy. Try again shortly.' });
    if (err instanceof ImgbbError && err.retryable) return send(res, 502, { error: 'Image service unreachable. Try again.' });
    return send(res, 502, { error: 'Upload was rejected by the image service.' });
  }
    }
