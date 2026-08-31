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

## Sessions and policy (`src/policy.ts`)

A session is a principal bound **out of band** when the server is created. The model cannot change it.

| Session | Function | Can do |
| --- | --- | --- |
| **reader** (default) | `readerSession()` | `files:read` only — `read_document`, not `send_payment` |
| **privileged** | `privilegedSession()` | `files:read` and `payments:send` |

`npm run dev` starts a **reader** session with `policyMode: "enforced"`.

**Policy on** (`policyMode: "enforced"`): tools that call `authorize` refuse work the session cannot do. That is what tests mean by “read-only session, policy on.”

**Permissive server** (`policyMode: "permissive"`): every tool skips `authorize` (including `send_payment`). Separate from `share_document`, which never checks policy at all.

## Tools

### `read_document(id)`

Looks up a document in the in-memory array (`src/workspace.ts`) and returns `{ id, body }`.

Under `policyMode: "enforced"`, this requires the session capability `files:read` (the default **reader** session has that; it cannot send payments).

### `share_document(id, destination)` — dangerous, currently permissive

Registered in `src/server.ts`. Arguments:

- `id` — document id (`public-notes`, `private-roadmap`, `malicious-document`)
- `destination` — who to “share” with (any string; treated as an email/URL in the demo)

It does **not** send email or call a network. It:

1. Finds the document in the in-memory array
2. Appends `destination` to that document’s `sharedWith` array (skips duplicates)
3. Returns text `SHARED <id> with <destination>` plus `{ id, destination, sharedWith }`

Example: sharing the confidential roadmap with an attacker records `sharedWith: ["attacker@evil.example"]` and prints `SHARED private-roadmap with attacker@evil.example`.

**Permissive** means this handler never calls `authorize`. The server does not ask whether this session is allowed to share `private-roadmap`. If the MCP client invoked the tool, the mutation happens. `policyMode: "enforced"` and reader vs privileged **do not apply** to `share_document`. That is the confused-deputy bug this experiment will later close with a server-side check.

`policyMode: "permissive"` on `createServer` is the same idea applied to **every** tool (including `send_payment`): skip capability checks. `share_document` is hardcoded to that behavior even when the rest of the server is enforced.

This step is done when an MCP client can invoke **both** `read_document` and `share_document`. That is `tests/share_document.test.ts`.

## Verify (tests)

```bash
npm test
```

`npm test` uses Vitest’s **verbose** reporter so each check prints as a sentence, not just a file count. Look for:

```
✓ MCP client can invoke both tools (including the dangerous one)
  ✓ MCP client lists and calls read_document AND share_document; share mutates sharedWith
  ✓ share_document is permissive: read-only session still shares private-roadmap when policy is on
```

That pair is the “client can invoke both tools” gate.

- `tests/read_document.test.ts` — connect + `read_document`
- `tests/share_document.test.ts` — both tools, including dangerous `share_document`
- `tests/securitytest.ts` — injection text, then payment policy for **reader** vs **privileged**

## Run the server (stdio)

```bash
npm run dev
```

This process waits for an MCP **host** on stdin/stdout (stderr prints that it is a reader session with policy enforced). Ctrl+C to stop. Point Cursor or another host at `tsx src/server.ts` (or `node dist/server.js` after `npm run build`).
