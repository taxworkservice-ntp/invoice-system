import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveHandler } from "../server/resolve.js";

const HANDLERS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "server", "handlers");
const moduleCache = new Map();

export default async function handler(req, res) {
  try {
    const raw = req.query?.path;
    const segments = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter(Boolean);
    const match = await resolveHandler(segments, HANDLERS_DIR);

    if (!match) {
      res.status(404).setHeader("Content-Type", "application/json; charset=utf-8");
      res.send(JSON.stringify({ error: "Not found" }));
      return;
    }

    let mod = moduleCache.get(match.file);
    if (!mod) {
      mod = await import(pathToFileURL(match.file).href);
      moduleCache.set(match.file, mod);
    }

    req.params = match.params;
    req.query = { ...req.query, ...match.params };
    await (mod.default ?? mod)(req, res);
  } catch (error) {
    console.error("[api]", req.url, error);
    if (!res.headersSent) {
      res.status(500).setHeader("Content-Type", "application/json; charset=utf-8");
      res.send(JSON.stringify({ error: "Internal server error" }));
    }
  }
}
