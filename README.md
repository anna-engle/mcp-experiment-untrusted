# mcp-experiment-untrusted

Minimal MCP **server** used to show prompt-injected document text inducing a consequential tool call, with authorization enforced **on the server** so untrusted content cannot enlarge the session’s privileges.

## What we built vs what we imported

This repo implements **our own MCP server** (`src/server.ts`): tools, the in-memory document list, and policy.

It does **not** implement a custom MCP client. Tests use the **official Model Context Protocol TypeScript SDK**:

| npm package | Role here |
| --- | --- |
| `@modelcontextprotocol/server` | `McpServer`, `registerTool`, in-process handler |
| `@modelcontextprotocol/client` | stock `Client` in `tests/harness.ts` (`listTools`, `callTool`) |

After `client.connect(...)`, the host discovers tools with `tools/list`. There is no separate “install tool” RPC; listing the tool is how the client knows it can call it.

## Workspace documents

Hardcoded in `src/workspace.ts`:

- `public-notes` — benign
- `private-roadmap` — internal
- `malicious-document` — contains a prompt injection aimed at `claim_admin` / `send_payment`

## First tools

`read_document(id)` looks up a document in that in-memory array and returns `{ id, body }`.

`share_document(id, destination)` is the **dangerous** tool. It does not send email or hit a network; it appends `destination` to `sharedWith` and returns a line like `SHARED private-roadmap with attacker@evil.example`.

**Permissive** here means: this handler does **not** call `authorize`. If an MCP client invokes the tool, the server records the share. Session capabilities (`intern` vs `treasurer`) and `policyMode: "enforced"` do not apply to `share_document`. That is the confused-deputy failure mode — later we will put a server-side check in front of it.

`policyMode: "permissive"` on `createServer` is the same idea for **all** tools (including `send_payment`): skip capability checks. `share_document` is always in that mode, even when the rest of the server is enforced.

## Verify (tests)

```bash
npm test
```

`tests/read_document.test.ts` checks:

1. A document is returned from the in-memory array (`getDocument`).
2. An SDK **client** connects to **our server** (`getServerVersion()` is `mcp-experiment-untrusted`).
3. The client can discover `read_document` (`listTools`) and **call** it (`callTool` for `public-notes` matches the array body).

`tests/share_document.test.ts` checks that the same client can invoke **both** `read_document` and `share_document`, and that `share_document` mutates `sharedWith` under an intern + enforced session.

Auth / injection cases live in `tests/securitytest.ts`.

## Run the server (stdio)

```bash
npm run dev
```

This process waits for an MCP **host** on stdin/stdout (stderr prints a short banner). Ctrl+C to stop. Point Cursor or another host at `tsx src/server.ts` (or `node dist/server.js` after `npm run build`).
