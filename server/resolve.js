import { access, readdir } from "node:fs/promises";
import path from "node:path";

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function safeSegment(raw) {
  let seg;
  try {
    seg = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (!seg || seg.includes("/") || seg.includes("\\") || seg.startsWith(".")) return null;
  return seg;
}

export async function resolveHandler(segments, baseDir) {
  let dir = baseDir;
  const params = {};

  for (const raw of segments) {
    const seg = safeSegment(raw);
    if (!seg) return null;

    const staticFile = path.join(dir, `${seg}.js`);
    if (await exists(staticFile)) return { file: staticFile, params };

    const staticDir = path.join(dir, seg);
    if (await exists(staticDir)) {
      dir = staticDir;
      continue;
    }

    const entries = await readdir(dir).catch(() => []);
    const dynFile = entries.find((entry) => /^\[\w+\]\.js$/.test(entry));
    if (dynFile) {
      params[dynFile.slice(1, -3)] = seg;
      return { file: path.join(dir, dynFile), params };
    }

    const dynDir = entries.find((entry) => /^\[\w+\]$/.test(entry));
    if (dynDir) {
      params[dynDir.slice(1, -1)] = seg;
      dir = path.join(dir, dynDir);
      continue;
    }

    return null;
  }

  const indexFile = path.join(dir, "index.js");
  if (await exists(indexFile)) return { file: indexFile, params };
  return null;
}
