// Static route table for the single catch-all lambda (api/[...path].js).
//
// Every handler module is imported STATICALLY so @vercel/node's file tracing
// (nft) bundles them into the function automatically — no runtime filesystem
// discovery and no includeFiles glob that build cache can break.
//
// matchRoute(segments) resolves a request path to { handler, params } using
// the same conventions as the old fs-based resolver:
//   literal segment  → exact match
//   "[param]"        → captures the segment into params

import storageAction from "./handlers/storage/[action].js";
import clientAudit from "./handlers/client/audit.js";
import clientMembers from "./handlers/client/members.js";
import clientRoles from "./handlers/client/roles.js";
import cronOverdue from "./handlers/cron/overdue.js";
import documentPdf from "./handlers/documents/[id]/pdf.js";
import adminClientsIndex from "./handlers/admin/clients/index.js";
import adminClientsCreate from "./handlers/admin/clients/create.js";
import adminClientIdIndex from "./handlers/admin/clients/[id]/index.js";
import adminClientIdAudit from "./handlers/admin/clients/[id]/audit.js";
import adminClientIdRoles from "./handlers/admin/clients/[id]/roles.js";
import adminClientIdMembers from "./handlers/admin/clients/[id]/members.js";
import whtGenerate from "./handlers/wht/generate.js";

export const routes = [
  // storage
  { segments: ["storage", "[action]"], handler: storageAction },
  // client workspace endpoints
  { segments: ["client", "audit"], handler: clientAudit },
  { segments: ["client", "members"], handler: clientMembers },
  { segments: ["client", "roles"], handler: clientRoles },
  // cron
  { segments: ["cron", "overdue"], handler: cronOverdue },
  // documents
  { segments: ["documents", "[id]", "pdf"], handler: documentPdf },
  // admin (literals before [id] so admin/clients/create matches create.js)
  { segments: ["admin", "clients"], handler: adminClientsIndex },
  { segments: ["admin", "clients", "create"], handler: adminClientsCreate },
  { segments: ["admin", "clients", "[id]"], handler: adminClientIdIndex },
  { segments: ["admin", "clients", "[id]", "audit"], handler: adminClientIdAudit },
  { segments: ["admin", "clients", "[id]", "roles"], handler: adminClientIdRoles },
  { segments: ["admin", "clients", "[id]", "members"], handler: adminClientIdMembers },
  // wht
  { segments: ["wht", "generate"], handler: whtGenerate },
];

export function matchRoute(segments) {
  for (const route of routes) {
    if (route.segments.length !== segments.length) continue;

    const params = {};
    let matched = true;
    for (let i = 0; i < segments.length; i++) {
      const pattern = route.segments[i];
      if (pattern.startsWith("[") && pattern.endsWith("]")) {
        params[pattern.slice(1, -1)] = segments[i];
      } else if (pattern !== segments[i]) {
        matched = false;
        break;
      }
    }

    if (matched) return { handler: route.handler, params };
  }
  return null;
}
