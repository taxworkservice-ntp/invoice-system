import { matchRoute } from "../server/routes.js";

export default async function handler(req, res) {
  try {
    const raw = req.query?.path;
    const segments = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter(Boolean);
    const match = matchRoute(segments);

    if (!match) {
      res.status(404).setHeader("Content-Type", "application/json; charset=utf-8");
      res.send(JSON.stringify({ error: "Not found" }));
      return;
    }

    req.params = match.params;
    req.query = { ...req.query, ...match.params };
    await (match.handler.default ?? match.handler)(req, res);
  } catch (error) {
    console.error("[api]", req.url, error);
    if (!res.headersSent) {
      res.status(500).setHeader("Content-Type", "application/json; charset=utf-8");
      res.send(JSON.stringify({ error: "Internal server error" }));
    }
  }
}
