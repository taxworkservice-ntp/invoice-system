// Per-request context for the API handlers.
//
// The API needs to know who is calling when it cannot use the service-role
// key: a scoped client is built from the caller's own session token, so the
// caller's JWT has to reach the Supabase helper. AsyncLocalStorage carries it
// through the handler call without threading it through every signature.
import { AsyncLocalStorage } from "node:async_hooks";

const requestContext = new AsyncLocalStorage();

function bearerToken(req) {
  const header = req?.headers?.authorization || req?.headers?.Authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

export function runWithRequestContext(req, fn) {
  return requestContext.run({ token: bearerToken(req) }, fn);
}

export function getRequestToken() {
  return requestContext.getStore()?.token || null;
}
