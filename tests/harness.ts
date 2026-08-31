import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";

import { readerSession } from "../src/policy.js";
import { createServer, type PolicyMode } from "../src/server.js";
import type { Workspace } from "../src/workspace.js";

export type Harness = {
  client: Client;
  workspace: Workspace;
  close: () => Promise<void>;
  workspaceLedgerLength: () => number;
};

export async function connectHarness(options: {
  policyMode: PolicyMode;
  session?: ReturnType<typeof readerSession>;
  outOfBandAdminToken?: string;
}): Promise<Harness> {
  const created = createServer({
    session: options.session ?? readerSession(),
    policyMode: options.policyMode,
    outOfBandAdminToken: options.outOfBandAdminToken,
  });

  const handler = createMcpHandler(() => created.server);
  const transport = new StreamableHTTPClientTransport(
    new URL("http://test.local/mcp"),
    {
      fetch: (url, init) => handler.fetch(new Request(url, init)),
    },
  );

  const client = new Client(
    { name: "test-harness", version: "0.1.0" },
    { versionNegotiation: { mode: "auto" } },
  );
  await client.connect(transport);

  return {
    client,
    workspace: created.workspace,
    workspaceLedgerLength: () => created.workspace.ledger.length,
    close: async () => {
      await client.close();
      await handler.close();
    },
  };
}

export function textOf(result: {
  content: unknown;
  isError?: boolean;
}): string {
  const content = result.content as Array<{ type: string; text?: string }>;
  return content
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("\n");
}
