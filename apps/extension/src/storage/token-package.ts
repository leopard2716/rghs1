import {
  packagedExtensionTokenSchema,
  parseWithSchema,
  type ApplyAssistantSettings
} from "../shared/schemas";

const tokenPackagePrefix = "rghs1-apply.";

export class ExtensionTokenPackageError extends Error {
  readonly code = "extension_token_package_invalid";

  constructor(
    message: string,
    readonly details: Record<string, string | number | boolean | null> = {}
  ) {
    super(message);
    this.name = "ExtensionTokenPackageError";
  }
}

export function settingsFromTokenInput(
  input: string,
  fallbackApiBaseUrl: string
): Partial<ApplyAssistantSettings> {
  const value = input.trim();
  if (!value.startsWith(tokenPackagePrefix)) {
    return {
      apiBaseUrl: fallbackApiBaseUrl,
      extensionToken: value
    };
  }

  let decoded: string;
  try {
    decoded = base64UrlDecode(value.slice(tokenPackagePrefix.length));
  } catch (error) {
    throw new ExtensionTokenPackageError("The extension token package is not valid base64url.", {
      prefix: tokenPackagePrefix,
      inputLength: value.length,
      browserError: error instanceof Error ? error.message : String(error)
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded) as unknown;
  } catch (error) {
    throw new ExtensionTokenPackageError("The extension token package is not valid JSON.", {
      prefix: tokenPackagePrefix,
      inputLength: value.length,
      decodedPreview: decoded.slice(0, 160),
      browserError: error instanceof Error ? error.message : String(error)
    });
  }

  const payload = parseWithSchema(packagedExtensionTokenSchema, parsed, "Extension token package");

  return {
    apiBaseUrl: payload.apiBaseUrl ?? fallbackApiBaseUrl,
    extensionToken: payload.token,
    tokenId: payload.tokenId,
    workspaceId: payload.workspace?.id,
    workspaceName: payload.workspace?.name,
    workspaceSlug: payload.workspace?.slug,
    memberId: payload.member?.id,
    memberAuthUserId: payload.member?.authUserId,
    memberEmail: payload.member?.email,
    memberDisplayName: payload.member?.displayName,
    profileId: payload.profile?.id,
    jobMarketId: payload.jobMarket?.id
  };
}

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
