export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function readJsonBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      throw new ApiError(400, "Invalid JSON body");
    }
  }
  return req.body;
}

export function sendJson(res, status, payload) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.send(JSON.stringify(payload));
}

export function sendError(res, error) {
  if (error instanceof ApiError) {
    sendJson(res, error.status, { error: error.message });
    return;
  }

  console.error(error);
  sendJson(res, 500, { error: "Internal server error" });
}
