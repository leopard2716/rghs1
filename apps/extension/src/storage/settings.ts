import { chromeApi } from "../shared/chrome";
import {
  applyAssistantSettingsSchema,
  parseWithSchema,
  type ApplyAssistantSettings
} from "../shared/schemas";

const settingsKey = "rghs1ApplyAssistantSettings";

const defaultSettings: ApplyAssistantSettings = {
  apiBaseUrl: "http://localhost:8787",
  tokenScopes: [],
  profiles: [],
  jobMarkets: []
};

export async function getSettings(): Promise<ApplyAssistantSettings> {
  const stored = await chromeApi().storage.local.get(settingsKey);
  const value = stored[settingsKey] ?? {};

  return parseWithSchema(
    applyAssistantSettingsSchema,
    {
      ...defaultSettings,
      ...(typeof value === "object" && value !== null ? value : {})
    },
    "Apply assistant settings"
  );
}

export async function saveSettings(input: unknown): Promise<ApplyAssistantSettings> {
  const settings = parseWithSchema(
    applyAssistantSettingsSchema,
    {
      ...defaultSettings,
      ...(typeof input === "object" && input !== null ? input : {})
    },
    "Apply assistant settings"
  );

  await chromeApi().storage.local.set({ [settingsKey]: settings });
  return settings;
}
