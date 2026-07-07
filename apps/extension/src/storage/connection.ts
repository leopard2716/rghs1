import { ApplyAssistantApi } from "../api/apply-assistant-api";
import {
  applyAssistantSettingsSchema,
  parseWithSchema,
  type ApplyAssistantSettings,
  type ExtensionTokenContext
} from "../shared/schemas";
import { getSettings, saveSettings } from "./settings";
import { settingsFromTokenInput } from "./token-package";

export async function connectExtensionTokenSettings(
  tokenInput: string,
  apiBaseUrl?: string
): Promise<ApplyAssistantSettings> {
  const current = await getSettings();
  const candidate = parseWithSchema(
    applyAssistantSettingsSchema,
    {
      ...current,
      ...settingsFromTokenInput(tokenInput, apiBaseUrl?.trim() || current.apiBaseUrl),
      tokenScopes: [],
      profiles: [],
      jobMarkets: []
    },
    "Apply assistant settings"
  );

  return refreshSettingsContext(candidate);
}

export async function saveSettingsAndRefresh(input: unknown): Promise<ApplyAssistantSettings> {
  const current = await getSettings();
  const candidate = parseWithSchema(
    applyAssistantSettingsSchema,
    {
      ...current,
      ...(typeof input === "object" && input !== null ? input : {})
    },
    "Apply assistant settings"
  );

  if (!candidate.extensionToken) {
    return saveSettings(candidate);
  }

  return refreshSettingsContext(candidate);
}

export async function refreshSettingsContext(
  settings?: ApplyAssistantSettings
): Promise<ApplyAssistantSettings> {
  const current = settings ?? (await getSettings());
  const api = new ApplyAssistantApi(current);
  const context = await api.getTokenContext();
  return saveSettings(settingsFromContext(current, context));
}

function settingsFromContext(
  current: ApplyAssistantSettings,
  context: ExtensionTokenContext
): ApplyAssistantSettings {
  const profileId =
    current.profileId && context.profiles.some((profile) => profile.id === current.profileId)
      ? current.profileId
      : context.token.defaultProfileId &&
          context.profiles.some((profile) => profile.id === context.token.defaultProfileId)
        ? context.token.defaultProfileId
        : context.profiles[0]?.id;
  const jobMarketId =
    current.jobMarketId && context.jobMarkets.some((market) => market.id === current.jobMarketId)
      ? current.jobMarketId
      : context.token.defaultJobMarketId &&
          context.jobMarkets.some((market) => market.id === context.token.defaultJobMarketId)
        ? context.token.defaultJobMarketId
        : context.jobMarkets[0]?.id;

  return parseWithSchema(
    applyAssistantSettingsSchema,
    {
      ...current,
      workspaceId: context.workspace.id,
      workspaceName: context.workspace.name,
      workspaceSlug: context.workspace.slug,
      memberId: context.member.id,
      memberAuthUserId: context.member.authUserId,
      memberEmail: context.member.email,
      memberDisplayName: context.member.displayName,
      tokenId: context.token.tokenId,
      tokenExpiresAt: context.token.expiresAt,
      tokenScopes: context.token.scopes,
      profiles: context.profiles,
      jobMarkets: context.jobMarkets,
      profileId,
      jobMarketId
    },
    "Apply assistant settings"
  );
}
