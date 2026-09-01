import { afterEach, describe, expect, it } from "vitest";

import { AGENT_PERMISSIONS, agentSession } from "../src/policy.js";
import {
  destinationFromUntrustedText,
  DOCUMENT_IDS,
  getDocument,
  INJECTION_SHARE_DESTINATION,
  MALICIOUS_DOCUMENT_ID,
  PRIVATE_ROADMAP_ID,
  PROMPT_INJECTION,
  PUBLIC_NOTES_ID,
} from "../src/workspace.js";
import { connectHarness, textOf, type Harness } from "./harness.js";

describe("workspace fixture", () => {
  it("keeps the three docs and a parseable injection", () => {
    expect([...DOCUMENT_IDS]).toEqual([
      PUBLIC_NOTES_ID,
      PRIVATE_ROADMAP_ID,
      MALICIOUS_DOCUMENT_ID,
    ]);
    expect(destinationFromUntrustedText(PROMPT_INJECTION)).toBe(
      INJECTION_SHARE_DESTINATION,
    );
  });
});

describe("policy", () => {
  it("grants read and withholds share by default", () => {
    expect(AGENT_PERMISSIONS["document:read"]).toBe(true);
    expect(AGENT_PERMISSIONS["document:share"]).toBe(false);

    const session = agentSession();
    expect(session.capabilities.has("document:read")).toBe(true);
    expect(session.capabilities.has("document:share")).toBe(false);
  });
});

describe("authorization", () => {
  let harness: Harness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("lists only read_document and share_document", async () => {
    harness = await connectHarness();
    const { tools } = await harness.client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "read_document",
      "share_document",
    ]);
  });

  it("Auth read succeeds", async () => {
    harness = await connectHarness({ session: agentSession() });

    const result = await harness.client.callTool({
      name: "read_document",
      arguments: { id: PUBLIC_NOTES_ID },
    });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ id: PUBLIC_NOTES_ID });
    expect(textOf(result).length).toBeGreaterThan(0);
  });

  it("Unauthed share fails", async () => {
    harness = await connectHarness({ session: agentSession() });

    const result = await harness.client.callTool({
      name: "share_document",
      arguments: {
        id: PRIVATE_ROADMAP_ID,
        destination: INJECTION_SHARE_DESTINATION,
      },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/lacks capability "document:share"/);
    expect(getDocument(harness.workspace, PRIVATE_ROADMAP_ID)?.sharedWith).toEqual(
      [],
    );
  });

  it("Malicious doc does not bypass auth", async () => {
    harness = await connectHarness({ session: agentSession() });

    const read = await harness.client.callTool({
      name: "read_document",
      arguments: { id: MALICIOUS_DOCUMENT_ID },
    });
    expect(read.isError).toBeFalsy();
    expect(textOf(read)).toContain(PROMPT_INJECTION);
    expect(
      destinationFromUntrustedText(textOf(read)),
    ).toBe(INJECTION_SHARE_DESTINATION);
    expect(harness.session.capabilities.has("document:share")).toBe(false);

    const share = await harness.client.callTool({
      name: "share_document",
      arguments: {
        id: PRIVATE_ROADMAP_ID,
        destination: INJECTION_SHARE_DESTINATION,
      },
    });
    expect(share.isError).toBe(true);
    expect(textOf(share)).toMatch(/lacks capability "document:share"/);
    expect(getDocument(harness.workspace, PRIVATE_ROADMAP_ID)?.sharedWith).toEqual(
      [],
    );
  });

  it("unprotected share succeeds (demo toggle only)", async () => {
    harness = await connectHarness({ enforceShareAuth: false });

    const result = await harness.client.callTool({
      name: "share_document",
      arguments: {
        id: PRIVATE_ROADMAP_ID,
        destination: INJECTION_SHARE_DESTINATION,
      },
    });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toBe(
      `SHARED ${PRIVATE_ROADMAP_ID} with ${INJECTION_SHARE_DESTINATION}`,
    );
    expect(getDocument(harness.workspace, PRIVATE_ROADMAP_ID)?.sharedWith).toEqual(
      [INJECTION_SHARE_DESTINATION],
    );
  });
});
