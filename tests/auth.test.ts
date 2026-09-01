import { afterEach, describe, expect, it } from "vitest";

import { agentSession } from "../src/policy.js";
import {
  getDocument,
  INJECTION_SHARE_DESTINATION,
  MALICIOUS_DOCUMENT_ID,
  PRIVATE_ROADMAP_ID,
  PROMPT_INJECTION,
  PUBLIC_NOTES_ID,
} from "../src/workspace.js";
import { connectHarness, textOf, type Harness } from "./harness.js";

describe("authorization", () => {
  let harness: Harness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("Auth read succeeds", async () => {
    harness = await connectHarness({ session: agentSession() });
    expect(harness.session.capabilities.has("document:read")).toBe(true);

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
    expect(harness.session.capabilities.has("document:share")).toBe(false);

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
});
