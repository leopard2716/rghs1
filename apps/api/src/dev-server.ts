import { serve } from "@hono/node-server";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp } from "./app";
import { createLocalR2Bucket } from "./infrastructure/local-r2-bucket";

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
const localR2Directory =
  process.env.LOCAL_R2_DIRECTORY ??
  fileURLToPath(new URL("../../../.local-r2/resume-bucket", import.meta.url));
const resumeBucket = createLocalR2Bucket(localR2Directory);
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
        APPLY_ASSISTANT_EXTRACT_MODEL: process.env.APPLY_ASSISTANT_EXTRACT_MODEL,
        APPLY_ASSISTANT_EXTRACT_PROVIDER: process.env.APPLY_ASSISTANT_EXTRACT_PROVIDER,
        APPLY_ASSISTANT_FIELD_AUTOFILL_MODEL: process.env.APPLY_ASSISTANT_FIELD_AUTOFILL_MODEL,
        APPLY_ASSISTANT_FIELD_AUTOFILL_PROVIDER:
          process.env.APPLY_ASSISTANT_FIELD_AUTOFILL_PROVIDER,
        APPLY_ASSISTANT_FIELD_EXTRACT_MODEL: process.env.APPLY_ASSISTANT_FIELD_EXTRACT_MODEL,
        APPLY_ASSISTANT_FIELD_EXTRACT_PROVIDER: process.env.APPLY_ASSISTANT_FIELD_EXTRACT_PROVIDER,
        APPLY_ASSISTANT_RESUME_MODEL: process.env.APPLY_ASSISTANT_RESUME_MODEL,
        APPLY_ASSISTANT_RESUME_PROVIDER: process.env.APPLY_ASSISTANT_RESUME_PROVIDER,
        EXTENSION_TOKEN_SECRET: process.env.EXTENSION_TOKEN_SECRET,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
        RESUME_BUCKET: resumeBucket
      }),
    port
  },
  (info) => {
    console.log(`RGHS1 API listening on http://127.0.0.1:${info.port}`);
    console.log(`RGHS1 API Supabase project: ${supabaseHost}`);
    console.log(`RGHS1 API local R2 directory: ${localR2Directory}`);
  }
);
