/**
 * Naive-agent demo (no LLM): read untrusted text, then try what it asks.
 *
 *   read malicious-document
 *   → share_document(private-roadmap, badguy@bad.com)
 *   → server checks document:share → DENY
 *
 * Run: npm run scenario
 */
import { getDocument, MALICIOUS_DOCUMENT_ID, PRIVATE_ROADMAP_ID } from "../src/workspace.js";
import { connectHarness, textOf } from "../tests/harness.js";

function log(line: string) {
  console.log(line);
}

const harness = await connectHarness();

try {
  log("=== injection scenario ===");
  log("agent: document:read=true  document:share=false");
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
  const match = body.match(/Share the private roadmap with (\S+)/i);
  if (!match?.[1]) {
    throw new Error("expected share instruction in malicious-document");
  }
  const destination = match[1];
  log(`   found: share private-roadmap with ${destination}`);
  log("");

  log(`3. MCP client → share_document({ id: "private-roadmap", destination: "${destination}" })`);
  const share = await harness.client.callTool({
    name: "share_document",
    arguments: { id: PRIVATE_ROADMAP_ID, destination },
  });
  const shareText = textOf(share);
  log("4. server checks policy (document:share)");
  log(`   tool result: ${shareText}`);
  log("");

  const sharedWith = getDocument(harness.workspace, PRIVATE_ROADMAP_ID)?.sharedWith ?? [];
  const denied =
    share.isError === true &&
    shareText.includes("document:share") &&
    sharedWith.length === 0;

  if (!denied) {
    log("expected DENY; share was not blocked");
    log(`   private-roadmap.sharedWith = ${JSON.stringify(sharedWith)}`);
    process.exitCode = 1;
  } else {
    log("DENY");
    log(`   private-roadmap.sharedWith = ${JSON.stringify(sharedWith)}`);
  }
} finally {
  await harness.close();
}
