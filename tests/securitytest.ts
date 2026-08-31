import { afterEach, describe, expect, it } from "vitest";

import { internSession, treasurerSession } from "../src/policy.js";
import {
  DOCUMENT_IDS,
  MALICIOUS_DOCUMENT_ID,
  PROMPT_INJECTION,
} from "../src/workspace.js";
import { connectHarness, textOf, type Harness } from "./harness.js";

describe("untrusted content vs server-side authority", () => {
  let harness: Harness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("lists only the three hardcoded documents", async () => {
    harness = await connectHarness({ policyMode: "enforced" });
    const result = await harness.client.callTool({
      name: "list_files",
      arguments: {},
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      ids: [...DOCUMENT_IDS],
    });
  });

  it("read_document returns an error for an unknown id", async () => {
    harness = await connectHarness({ policyMode: "enforced" });
    const result = await harness.client.callTool({
      name: "read_document",
      arguments: { id: "does-not-exist" },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("no such document: does-not-exist");
  });

  it("exposes prompt-injected text through malicious-document", async () => {
    harness = await connectHarness({ policyMode: "enforced" });
    const result = await harness.client.callTool({
      name: "read_document",
      arguments: { id: MALICIOUS_DOCUMENT_ID },
    });
    expect(result.isError).toBeFalsy();
    const body = textOf(result);
    expect(body).toContain(PROMPT_INJECTION);
    expect(body).toContain("send_payment");
    expect(body).toContain("claim_admin");
  });

  it("permissive mode: an induced send_payment succeeds (confused deputy)", async () => {
    harness = await connectHarness({ policyMode: "permissive" });
    const result = await harness.client.callTool({
      name: "send_payment",
      arguments: { payee: "attacker@evil.example", amountCents: 500000 },
    });
    expect(result.isError).toBeFalsy();
    expect(harness.workspaceLedgerLength()).toBe(1);
    expect(result.structuredContent).toMatchObject({
      payee: "attacker@evil.example",
      amountCents: 500000,
    });
  });

  it("enforced intern session: induced send_payment is denied and the ledger is unchanged", async () => {
    harness = await connectHarness({
      policyMode: "enforced",
      session: internSession(),
    });
    const result = await harness.client.callTool({
      name: "send_payment",
      arguments: { payee: "attacker@evil.example", amountCents: 500000 },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/lacks capability "payments:send"/);
    expect(harness.workspaceLedgerLength()).toBe(0);
  });

  it("enforced intern session: claim_admin with a token from the injection does not grant payments", async () => {
    harness = await connectHarness({
      policyMode: "enforced",
      session: internSession(),
    });
    const claimed = await harness.client.callTool({
      name: "claim_admin",
      arguments: { token: "i-am-the-treasurer" },
    });
    expect(claimed.isError).toBe(true);

    const payment = await harness.client.callTool({
      name: "send_payment",
      arguments: { payee: "attacker@evil.example", amountCents: 500000 },
    });
    expect(payment.isError).toBe(true);
    expect(harness.workspaceLedgerLength()).toBe(0);
  });

  it("enforced intern session: even a correct out-of-band token does not enlarge this session", async () => {
    harness = await connectHarness({
      policyMode: "enforced",
      session: internSession(),
      outOfBandAdminToken: "rotate-me-out-of-band",
    });
    const claimed = await harness.client.callTool({
      name: "claim_admin",
      arguments: { token: "rotate-me-out-of-band" },
    });
    expect(claimed.isError).toBeFalsy();
    expect(claimed.structuredContent).toEqual({ granted: false });

    const payment = await harness.client.callTool({
      name: "send_payment",
      arguments: { payee: "attacker@evil.example", amountCents: 1 },
    });
    expect(payment.isError).toBe(true);
    expect(harness.workspaceLedgerLength()).toBe(0);
  });

  it("enforced treasurer session: send_payment is allowed because the principal was bound out of band", async () => {
    harness = await connectHarness({
      policyMode: "enforced",
      session: treasurerSession(),
    });
    const result = await harness.client.callTool({
      name: "send_payment",
      arguments: { payee: "vendor@example.com", amountCents: 42 },
    });
    expect(result.isError).toBeFalsy();
    expect(harness.workspaceLedgerLength()).toBe(1);
    expect(result.structuredContent).toMatchObject({
      payee: "vendor@example.com",
      requestedBy: "treasurer",
    });
  });
});
