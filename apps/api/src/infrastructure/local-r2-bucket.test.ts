import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLocalR2Bucket } from "./local-r2-bucket";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.map((directory) => rm(directory, { force: true, recursive: true }))
  );
  tempDirectories.length = 0;
});

describe("local R2 bucket", () => {
  it("stores, reads, and deletes objects with metadata", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "rghs1-r2-"));
    tempDirectories.push(directory);
    const bucket = createLocalR2Bucket(directory);

    await bucket.put("workspace-1/members/member-1/avatar.png", new Blob(["avatar"]).stream(), {
      httpMetadata: {
        contentType: "image/png"
      },
      customMetadata: {
        workspaceId: "workspace-1"
      }
    });

    const object = await bucket.get("workspace-1/members/member-1/avatar.png");
    if (!object?.body) {
      throw new Error("Expected local R2 object body.");
    }

    await expect(new Response(object.body).text()).resolves.toBe("avatar");
    expect(object.httpMetadata?.contentType).toBe("image/png");
    expect(object.customMetadata?.workspaceId).toBe("workspace-1");

    await bucket.delete("workspace-1/members/member-1/avatar.png");
    await expect(bucket.get("workspace-1/members/member-1/avatar.png")).resolves.toBeNull();
  });
});
