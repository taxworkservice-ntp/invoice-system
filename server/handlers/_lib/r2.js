import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  S3Client,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getEnv } from "./env.js";

// Server-only credentials — no VITE_* fallbacks: Vite would inline them
// into the client bundle.
const bucket = process.env.R2_BUCKET;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const endpoint = process.env.R2_ENDPOINT;

// Two backends, picked from the environment:
//   "r2"    → Cloudflare R2 (production, and local dev with credentials set)
//   "local" → files on disk, opted into with DEV_STORAGE_DIR. Local dev only:
//              it keeps uploads/downloads working without handing production
//              storage credentials to a laptop.
// With neither, importing this module throws — a missing bucket must not
// look like an empty bucket.
const localDir = process.env.DEV_STORAGE_DIR ? path.resolve(process.env.DEV_STORAGE_DIR) : null;
const r2Configured = Boolean(bucket && accessKeyId && secretAccessKey && endpoint);

export const storageMode = r2Configured ? "r2" : localDir ? "local" : "unconfigured";

if (storageMode === "unconfigured") {
  getEnv("R2_BUCKET");
  getEnv("R2_ACCESS_KEY_ID");
  getEnv("R2_SECRET_ACCESS_KEY");
  getEnv("R2_ENDPOINT");
}

export const r2Bucket = bucket;

const r2 = r2Configured
  ? new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    })
  : null;

// --- local disk backend -------------------------------------------------

const LOCAL_SIGNING_SECRET = process.env.DEV_STORAGE_SECRET || "invoice-system-local-storage";
const LOCAL_URL_TTL_MS = 60 * 60 * 1000;

function localPathFor(key) {
  const root = path.resolve(localDir);
  const target = path.resolve(root, key);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error(`Invalid storage key: ${key}`);
  }
  return target;
}

function localSignature(key, expiresAt) {
  return crypto
    .createHmac("sha256", LOCAL_SIGNING_SECRET)
    .update(`${key}|${expiresAt}`)
    .digest("hex");
}

/**
 * Signed URL for a locally stored object. It points at the app origin so the
 * browser fetches it same-origin (Vite proxies /api to the dev API server).
 */
export function createLocalObjectUrl(key, ttlMs = LOCAL_URL_TTL_MS) {
  const expiresAt = Date.now() + ttlMs;
  const origin = process.env.DEV_APP_ORIGIN || "http://localhost:5173";
  const params = new URLSearchParams({
    key,
    expires: String(expiresAt),
    sig: localSignature(key, expiresAt),
  });
  return `${origin}/api/storage/local-object?${params.toString()}`;
}

export function verifyLocalObjectSignature({ key, expires, sig }) {
  const expiresAt = Number(expires);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  const expected = Buffer.from(localSignature(key, expiresAt));
  const provided = Buffer.from(String(sig || ""));
  if (expected.length !== provided.length) return false;
  return crypto.timingSafeEqual(expected, provided);
}

async function localPutObject(key, body, contentType) {
  const file = localPathFor(key);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, body);
  await fs.promises.writeFile(
    `${file}.meta.json`,
    JSON.stringify({ contentType: contentType || "application/octet-stream" }),
  );
}

async function localGetObject(key) {
  const file = localPathFor(key);
  const bytes = await fs.promises.readFile(file);

  let contentType = "application/octet-stream";
  try {
    const meta = JSON.parse(await fs.promises.readFile(`${file}.meta.json`, "utf8"));
    if (meta?.contentType) contentType = meta.contentType;
  } catch {
    // No sidecar (or an unreadable one) → the default content type is fine.
  }

  return { bytes, contentType };
}

async function localDeleteObject(key) {
  const file = localPathFor(key);
  await fs.promises.rm(file, { force: true });
  await fs.promises.rm(`${file}.meta.json`, { force: true });
}

// --- shared API ---------------------------------------------------------

export function getUploadSignedUrl(key, contentType) {
  if (storageMode === "local") {
    throw new Error(
      "Direct uploads are not supported by the local storage backend — use /api/storage/upload-file",
    );
  }
  return getSignedUrl(
    r2,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType || "application/octet-stream",
    }),
    { expiresIn: 300 },
  );
}

export async function putR2Object(key, body, contentType) {
  if (storageMode === "local") {
    await localPutObject(key, body, contentType);
    return;
  }
  await r2.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType || "application/octet-stream",
    }),
  );
}

export function getDownloadSignedUrl(key, expiresIn = 3600) {
  if (storageMode === "local") {
    return createLocalObjectUrl(key, expiresIn * 1000);
  }
  return getSignedUrl(
    r2,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
    { expiresIn },
  );
}

export async function getR2ObjectBytes(key) {
  if (storageMode === "local") {
    const { bytes, contentType } = await localGetObject(key);
    return { bytes: Buffer.from(bytes), contentType };
  }
  const response = await r2.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return {
    bytes: Buffer.concat(chunks),
    contentType: response.ContentType || "application/octet-stream",
  };
}

export async function deleteR2Object(key) {
  if (storageMode === "local") {
    await localDeleteObject(key);
    return;
  }
  await r2.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
}
