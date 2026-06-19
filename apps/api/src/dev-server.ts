import { serve } from "@hono/node-server";
import { existsSync, readFileSync } from "node:fs";
import { createApp } from "./app";

function loadEnvFile(path: URL): void {
  if (!existsSync(path)) {
    return;
  }

  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(new URL("../../../.env", import.meta.url));
loadEnvFile(new URL("../.env", import.meta.url));

const app = createApp();
const port = Number(process.env.PORT ?? 8787);
const supabaseHost = (() => {
  try {
    return process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).host : "not configured";
  } catch {
    return "invalid SUPABASE_URL";
  }
})();

serve(
  {
    fetch: (request) =>
      app.fetch(request, {
        APP_NAME: process.env.APP_NAME ?? "RGHS1 Local API",
        ALLOWED_ORIGINS:
          process.env.ALLOWED_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173",
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
      }),
    port
  },
  (info) => {
    console.log(`RGHS1 API listening on http://127.0.0.1:${info.port}`);
    console.log(`RGHS1 API Supabase project: ${supabaseHost}`);
  }
);
