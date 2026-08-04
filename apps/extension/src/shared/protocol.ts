export const extensionProtocolVersion = "2026-08-03.3";

export function requireCurrentExtensionProtocol(value: unknown): void {
  if (!isObject(value) || value.protocolVersion !== extensionProtocolVersion) {
    throw new Error(
      "Apply Assistant was updated, but Chrome is still running an older background worker. Reload the extension on chrome://extensions, then reopen this panel."
    );
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
