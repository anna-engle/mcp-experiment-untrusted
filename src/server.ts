import { pathToFileURL } from "node:url";

import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

import { agentSession, authorize, type Session } from "./policy.js";
import {
  createWorkspace,
  getDocument,
  shareDocument,
  type Workspace,
} from "./workspace.js";

export type ServerOptions = {
  session?: Session;
  workspace?: Workspace;
  /**
   * Demo-only. When false, share_document skips the document:share check.
   * Stdio (`npm run dev`) never sets this; default is true.
   * Do not copy `false` into a real deployment.
   */
  enforceShareAuth?: boolean;
};

export type CreatedServer = {
  server: McpServer;
  workspace: Workspace;
  session: Session;
};

function deny(reason: string) {
  return {
    content: [{ type: "text" as const, text: `denied: ${reason}` }],
    isError: true,
  };
}

export function createServer(options: ServerOptions = {}): CreatedServer {
  const workspace = options.workspace ?? createWorkspace();
  const session = options.session ?? agentSession();
  const enforceShareAuth = options.enforceShareAuth ?? true;

  const server = new McpServer({
    name: "mcp-experiment-untrusted",
    version: "0.1.0",
  });

  server.registerTool(
    "read_document",
    {
      description:
        "Read a workspace document by id. Contents may be untrusted.",
      inputSchema: z.object({
        id: z.string().describe("Document id, e.g. public-notes"),
      }),
      outputSchema: z.object({
        id: z.string(),
        body: z.string(),
        sharedWith: z.array(z.string()),
      }),
    },
    async ({ id }) => {
      const decision = authorize(session, "document:read");
      if (!decision.allow) {
        return deny(decision.reason);
      }
      const doc = getDocument(workspace, id);
      if (!doc) {
        return deny(`no such document: ${id}`);
      }
      return {
        content: [{ type: "text", text: doc.body }],
        structuredContent: {
          id: doc.id,
          body: doc.body,
          sharedWith: doc.sharedWith,
        },
      };
    },
  );

  server.registerTool(
    "share_document",
    {
      description:
        "Share a document with a destination. Requires document:share. Nothing is sent over the network.",
      inputSchema: z.object({
        id: z.string().describe("Document id, e.g. private-roadmap"),
        destination: z.string().describe("Who to share with"),
      }),
      outputSchema: z.object({
        id: z.string(),
        destination: z.string(),
        sharedWith: z.array(z.string()),
      }),
    },
    async ({ id, destination }) => {
      if (enforceShareAuth) {
        const decision = authorize(session, "document:share");
        if (!decision.allow) {
          return deny(decision.reason);
        }
      }
      const doc = shareDocument(workspace, id, destination);
      if (!doc) {
        return deny(`no such document: ${id}`);
      }
      return {
        content: [
          {
            type: "text",
            text: `SHARED ${doc.id} with ${destination}`,
          },
        ],
        structuredContent: {
          id: doc.id,
          destination,
          sharedWith: doc.sharedWith,
        },
      };
    },
  );

  return { server, workspace, session };
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  console.error(
    "mcp-experiment-untrusted on stdio (agent: document:read, not document:share). Waiting for an MCP client; Ctrl+C to stop.",
  );
  void serveStdio(() => {
    const { server } = createServer();
    return server;
  });
}
