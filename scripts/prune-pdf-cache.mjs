/**
 * Prunes the cached PDF renders in the object store.
 *
 * The cache key carries the print signature (the layout version plus a
 * fingerprint of the workspace's print settings), so every layout or settings
 * change leaves the previous renders behind as orphans: they are never read
 * again, but they still take space. This tool removes them.
 *
 *   node scripts/prune-pdf-cache.mjs --dry-run     # list what would go
 *   node scripts/prune-pdf-cache.mjs --orphans     # the leftovers of an older layout
 *   node scripts/prune-pdf-cache.mjs --all         # flush the cache completely
 *
 * The renders are a cache: deleting them only means the next download renders
 * the document again. In local mode (DEV_STORAGE_DIR) the same tool prunes the
 * local disk cache.
 *
 * The durable fix is an expiration rule on the bucket's pdfs/ prefix — then
 * the orphans (and the current cache) expire on their own.
 */
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { S3Client, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

const root = process.cwd();
const dryRun = process.argv.includes("--dry-run");
const flushAll = process.argv.includes("--all");
const orphansOnly = process.argv.includes("--orphans");
const prefix = process.env.PDF_CACHE_PREFIX || "pdfs/";

// The env files carry the storage configuration (R2_*, DEV_STORAGE_DIR).
async function loadEnvFiles() {
  for (const name of [".env.local", ".env.development", ".env"]) {
    let content;
    try {
      content = await fsPromises.readFile(path.join(root, name), "utf8");
    } catch {
      continue;
    }
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(match[1] in process.env)) process.env[match[1]] = value;
    }
  }
}

await loadEnvFiles();

// The layout version the code is at (src/constants/index.ts).
function currentPrintLayoutVersion() {
  const source = fs.readFileSync(path.join(root, "src", "constants", "index.ts"), "utf8");
  const parsed = Number(source.match(/PRINT_LAYOUT_VERSION\s*=\s*(\d+)/)?.[1]);
  return Number.isFinite(parsed) ? parsed : 1;
}

const layoutVersion = currentPrintLayoutVersion();

/** The cached renders on the local disk, with their size. */
async function listLocalObjects() {
  const base = path.join(root, process.env.DEV_STORAGE_DIR || ".local-storage");
  const found = [];
  const walk = async (current) => {
    let entries = [];
    try {
      entries = await fsPromises.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.name.endsWith(".pdf")) {
        const stat = await fsPromises.stat(full);
        found.push({
          key: path.relative(base, full).split(path.sep).join("/"),
          size: stat.size,
        });
      }
    }
  };
  await walk(path.join(base, prefix));
  return { objects: found, base };
}

/** The cached renders in the bucket, with their size. */
async function listBucketObjects() {
  const bucket = process.env.R2_BUCKET;
  if (!bucket) {
    throw new Error("R2_BUCKET is not set (or use DEV_STORAGE_DIR for the local cache)");
  }
  const client = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
  });
  const objects = [];
  let token;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
    );
    for (const item of page.Contents || []) {
      objects.push({ key: item.Key, size: item.Size || 0 });
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return { objects, client, bucket };
}

/** An object is an orphan when it was rendered with an older layout. */
function isOrphan(key) {
  return !key.includes(`-v${layoutVersion}-`);
}

async function main() {
  const local = process.env.DEV_STORAGE_DIR;
  let objects = [];
  let remove;

  if (local) {
    const found = await listLocalObjects();
    objects = found.objects;
    remove = async (key) => {
      await fsPromises.rm(path.join(found.base, key), { force: true });
    };
    console.log(`local cache: ${path.join(local, prefix)}`);
  } else {
    const bucket = await listBucketObjects();
    objects = bucket.objects;
    remove = async (key) => {
      await bucket.client.send(new DeleteObjectCommand({ Bucket: bucket.bucket, Key: key }));
    };
    console.log(`bucket: ${process.env.R2_BUCKET} (${prefix})`);
  }

  const targets = flushAll
    ? objects
    : orphansOnly
      ? objects.filter((object) => isOrphan(object.key))
      : [];

  const bytes = targets.reduce((total, object) => total + (object.size || 0), 0);
  console.log(
    `${objects.length} cached render(s), ${targets.length} to remove ` +
      `(${(bytes / 1024 / 1024).toFixed(1)} MB), layout v${layoutVersion}`,
  );

  if (dryRun) {
    for (const object of targets.slice(0, 20)) {
      console.log(`  would remove ${object.key}`);
    }
    if (targets.length > 20) console.log(`  … and ${targets.length - 20} more`);
    return;
  }

  for (const object of targets) {
    await remove(object.key);
  }
  console.log(`removed ${targets.length} object(s)`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
