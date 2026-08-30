import { matchRoute } from "../server/routes.js";

function requestSegments(req) {
  const rawPath = req.query?.path;
  const pathValue = Array.isArray(rawPath) ? rawPath.join("/") : rawPath;
  if (typeof pathValue === "string" && pathValue) {
    return pathValue.split("/").filter(Boolean);
  }

  // Supports direct requests to /api/index without the rewrite query.
  const pathname = String(req.url || "").split("?", 1)[0];
  return pathname.replace(/^\/api(?:\/index)?\/?/, "").split("/").filter(Boolean);
}

export default async function handler(req, res) {
  try {
    const match = matchRoute(requestSegments(req));

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
