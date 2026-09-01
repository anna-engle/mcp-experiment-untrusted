/**
 * Naive-agent demo (no LLM): read untrusted text, then try what it asks.
 *
 *   npm run scenario:open   — --open, no document:share check (attack succeeds)
 *   npm run scenario        — check in place (DENY)
 */
import {
  destinationFromUntrustedText,
  getDocument,
  MALICIOUS_DOCUMENT_ID,
  PRIVATE_ROADMAP_ID,
} from "../src/workspace.js";
import { connectHarness, textOf } from "../tests/harness.js";

function log(line: string) {
  console.log(line);
}

const enforceShareAuth =
  !process.argv.includes("--open") && process.env.SHARE_AUTH !== "off";
const harness = await connectHarness({ enforceShareAuth });

try {
  log("=== injection scenario ===");
  log(
    enforceShareAuth
      ? "share auth: ON  (document:share required)"
      : "share auth: OFF (unprotected — if the agent asks, we share)",
  );
  log("");

  log("1. MCP client → read_document({ id: \"malicious-document\" })");
  const read = await harness.client.callTool({
    name: "read_document",
    arguments: { id: MALICIOUS_DOCUMENT_ID },
  });
  const body = textOf(read);
  log("--- document body ---");
  log(body);
  log("--- end body ---");
  log("");

  log("2. Agent encounters instruction in untrusted text");
  const destination = destinationFromUntrustedText(body);
  if (!destination) {
    throw new Error("expected share instruction in malicious-document");
  }
  log(`   found: share private-roadmap with ${destination}`);
  log("");

  log(`3. MCP client → share_document({ id: "private-roadmap", destination: "${destination}" })`);
  const share = await harness.client.callTool({
    name: "share_document",
    arguments: { id: PRIVATE_ROADMAP_ID, destination },
  });
  const shareText = textOf(share);
  log(
    enforceShareAuth
      ? "4. server checks policy (document:share)"
      : "4. server does not check document:share",
  );
  log(`   tool result: ${shareText}`);
  log("");

  const sharedWith = getDocument(harness.workspace, PRIVATE_ROADMAP_ID)?.sharedWith ?? [];

  if (enforceShareAuth) {
    const denied =
      share.isError === true &&
      shareText.includes("document:share") &&
      sharedWith.length === 0;
    if (!denied) {
      log("expected DENY; share was not blocked");
      process.exitCode = 1;
    } else {
      log("DENY");
    }
  } else {
    const leaked =
      !share.isError &&
      shareText.startsWith("SHARED ") &&
      sharedWith.includes(destination);
    if (!leaked) {
      log("expected SUCCESS; share did not land");
      process.exitCode = 1;
    } else {
      log("SUCCESS");
    }
  }
  log(`   private-roadmap.sharedWith = ${JSON.stringify(sharedWith)}`);
} finally {
  await harness.close();
}
