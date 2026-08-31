import { afterEach, describe, expect, it } from "vitest";

import {
  createWorkspace,
  DOCUMENTS,
  getDocument,
  PUBLIC_NOTES_ID,
} from "../src/workspace.js";
import { connectHarness, textOf, type Harness } from "./harness.js";

describe("read_document MCP tool", () => {
  let harness: Harness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("returns a document from the in-memory array", () => {
    const workspace = createWorkspace();
    const fromArray = workspace.documents.find((doc) => doc.id === PUBLIC_NOTES_ID);
    const lookedUp = getDocument(workspace, PUBLIC_NOTES_ID);

    expect(workspace.documents).toHaveLength(DOCUMENTS.length);
    expect(lookedUp).toEqual(fromArray);
    expect(lookedUp?.body).toBe(
      DOCUMENTS.find((doc) => doc.id === PUBLIC_NOTES_ID)?.body,
    );
  });

  it("connects an MCP client to the server", async () => {
    harness = await connectHarness({ policyMode: "enforced" });

    const info = harness.client.getServerVersion();
    expect(info).toMatchObject({
      name: "mcp-experiment-untrusted",
      version: "0.1.0",
    });
    expect(harness.client.getServerCapabilities()?.tools).toBeDefined();
  });

  it("advertises read_document so the client can install/use the tool", async () => {
    harness = await connectHarness({ policyMode: "enforced" });

    const { tools } = await harness.client.listTools();
    const readDocument = tools.find((tool) => tool.name === "read_document");
    expect(readDocument).toBeDefined();
    expect(readDocument?.description).toMatch(/document/i);
    expect(JSON.stringify(readDocument?.inputSchema)).toContain("id");
  });

  it("lets the connected client call read_document and get the array body", async () => {
    harness = await connectHarness({ policyMode: "enforced" });
    const expected = getDocument(createWorkspace(), PUBLIC_NOTES_ID);

    const result = await harness.client.callTool({
      name: "read_document",
      arguments: { id: PUBLIC_NOTES_ID },
    });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      id: PUBLIC_NOTES_ID,
      body: expected?.body,
    });
    expect(textOf(result)).toBe(expected?.body);
  });
});
