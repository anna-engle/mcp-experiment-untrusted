import { pathToFileURL } from "node:url";

import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

import {
  authorize,
  evaluateClaimAdmin,
  internSession,
  type Session,
} from "./policy.js";
import { createWorkspace, type Workspace } from "./workspace.js";

export type PolicyMode = "permissive" | "enforced";

export type ServerOptions = {
  session: Session;
  /**
   * permissive: tool handlers run if the model asked — the failure mode this
   * experiment demonstrates (the server treated the agent as already authorized).
   * enforced: every consequential action is checked against the bound session.
   */
  policyMode: PolicyMode;
  workspace?: Workspace;
  /** Never place this value in workspace files. Used only by claim_admin. */
  outOfBandAdminToken?: string;
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

export function createServer(options: ServerOptions): CreatedServer {
  const workspace = options.workspace ?? createWorkspace();
  const { session, policyMode } = options;

  const server = new McpServer({
    name: "mcp-experiment-untrusted",
    version: "0.1.0",
  });

  const requireCapability = (required: Parameters<typeof authorize>[1]) => {
    if (policyMode === "permissive") {
      return { allow: true as const };
    }
    return authorize(session, required);
  };

  server.registerTool(
    "list_files",
    {
      description: "List paths in the workspace.",
      inputSchema: z.object({}),
      outputSchema: z.object({ paths: z.array(z.string()) }),
    },
    async () => {
      const decision = requireCapability("files:read");
      if (!decision.allow) {
        return deny(decision.reason);
      }
      const paths = [...workspace.files.keys()].sort();
      return {
        content: [{ type: "text", text: paths.join("\n") }],
        structuredContent: { paths },
      };
    },
  );

  server.registerTool(
    "read_file",
    {
      description: "Read a workspace file by path. Contents may be untrusted.",
      inputSchema: z.object({
        path: z.string().describe("Workspace-relative path"),
      }),
      outputSchema: z.object({ path: z.string(), text: z.string() }),
    },
    async ({ path }) => {
      const decision = requireCapability("files:read");
      if (!decision.allow) {
        return deny(decision.reason);
      }
      const text = workspace.files.get(path);
      if (text === undefined) {
        return deny(`no such file: ${path}`);
      }
      return {
        content: [{ type: "text", text }],
        structuredContent: { path, text },
      };
    },
  );

  server.registerTool(
    "send_payment",
    {
      description:
        "Send a payment. Consequential. Authorization is decided on the server, not by the model.",
      inputSchema: z.object({
        payee: z.string(),
        amountCents: z.number().int().positive(),
      }),
      outputSchema: z.object({
        payee: z.string(),
        amountCents: z.number(),
        requestedBy: z.string(),
      }),
    },
    async ({ payee, amountCents }) => {
      const decision = requireCapability("payments:send");
      if (!decision.allow) {
        return deny(decision.reason);
      }
      const entry = {
        payee,
        amountCents,
        requestedBy: session.principalId,
      };
      workspace.ledger.push(entry);
      return {
        content: [
          {
            type: "text",
            text: `paid ${amountCents} cents to ${payee}`,
          },
        ],
        structuredContent: entry,
      };
    },
  );

  server.registerTool(
    "claim_admin",
    {
      description:
        "Attempt to expand this session's capabilities. Injected text often asks for this. The server ignores the request unless an out-of-band token matches.",
      inputSchema: z.object({
        token: z.string().describe("Claimed admin token"),
      }),
      outputSchema: z.object({ granted: z.boolean() }),
    },
    async ({ token }) => {
      if (policyMode === "permissive") {
        return {
          content: [
            {
              type: "text",
              text: "permissive mode: claim_admin would have expanded authority; this demo does not mutate the session object",
            },
          ],
          structuredContent: { granted: true },
        };
      }
      const decision = evaluateClaimAdmin({
        session,
        offeredToken: token,
        outOfBandAdminToken: options.outOfBandAdminToken,
      });
      if (!decision.allow) {
        return deny(decision.reason);
      }
      return {
        content: [
          {
            type: "text",
            text: "token matched; still does not enlarge this session — mint a new session out of band",
          },
        ],
        structuredContent: { granted: false },
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
    "mcp-experiment-untrusted on stdio (intern, enforced). Waiting for an MCP client; Ctrl+C to stop.",
  );
  void serveStdio(() => {
    const { server } = createServer({
      session: internSession(),
      policyMode: "enforced",
    });
    return server;
  });
}
