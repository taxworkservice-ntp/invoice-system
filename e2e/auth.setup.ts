import fs from "node:fs";
import { test as setup } from "@playwright/test";
import { AUTH_STATE_PATH, BASE_URL, PROJECT_REF, signInAndGetSession } from "./helpers/env";

setup("authenticate", async () => {
  const session = await signInAndGetSession();

  const state = {
    cookies: [] as unknown[],
    origins: [
      {
        origin: BASE_URL,
        localStorage: [
          {
            name: `sb-${PROJECT_REF}-auth-token`,
            value: JSON.stringify(session),
          },
        ],
      },
    ],
  };

  fs.mkdirSync(path.dirname(AUTH_STATE_PATH), { recursive: true });
  fs.writeFileSync(AUTH_STATE_PATH, JSON.stringify(state));
});

import path from "node:path";
