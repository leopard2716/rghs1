import { describe, expect, it } from "vitest";
import { extensionProtocolVersion, requireCurrentExtensionProtocol } from "./protocol";

describe("extension protocol", () => {
  it("accepts the matching background worker version", () => {
    expect(() =>
      requireCurrentExtensionProtocol({ protocolVersion: extensionProtocolVersion })
    ).not.toThrow();
  });

  it("gives reload instructions for a stale background worker", () => {
    expect(() => requireCurrentExtensionProtocol({ ok: false })).toThrow(
      /Reload the extension on chrome:\/\/extensions/
    );
  });
});
