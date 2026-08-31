import { afterEach, describe, expect, it } from "vitest";

import { readerSession, privilegedSession } from "../src/policy.js";
import {
  DOCUMENT_IDS,
  MALICIOUS_DOCUMENT_ID,
  PROMPT_INJECTION,
} from "../src/workspace.js";
import { connectHarness, textOf, type Harness } from "./harness.js";

describe("security: untrusted content vs server-side authority", () => {
  let harness: Harness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("list_files returns only public-notes, private-roadmap, malicious-document", async () => {
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

  it("read_document rejects an unknown id", async () => {
    harness = await connectHarness({ policyMode: "enforced" });
    const result = await harness.client.callTool({
      name: "read_document",
      arguments: { id: "does-not-exist" },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("no such document: does-not-exist");
  });

  it("malicious-document body contains the prompt injection (send_payment / claim_admin)", async () => {
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

  it("permissive server: induced send_payment succeeds (confused deputy)", async () => {
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

  it("read-only session, policy on: induced send_payment is denied; ledger unchanged", async () => {
    harness = await connectHarness({
      policyMode: "enforced",
      session: readerSession(),
    });
    const result = await harness.client.callTool({
      name: "send_payment",
      arguments: { payee: "attacker@evil.example", amountCents: 500000 },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/lacks capability "payments:send"/);
    expect(harness.workspaceLedgerLength()).toBe(0);
  });

  it("read-only session, policy on: claim_admin from injected text does not unlock payments", async () => {
    harness = await connectHarness({
      policyMode: "enforced",
      session: readerSession(),
    });
    const claimed = await harness.client.callTool({
      name: "claim_admin",
      arguments: { token: "i-am-privileged" },
    });
    expect(claimed.isError).toBe(true);

    const payment = await harness.client.callTool({
      name: "send_payment",
      arguments: { payee: "attacker@evil.example", amountCents: 500000 },
    });
    expect(payment.isError).toBe(true);
    expect(harness.workspaceLedgerLength()).toBe(0);
  });

  it("read-only session, policy on: matching out-of-band token still does not enlarge this session", async () => {
    harness = await connectHarness({
      policyMode: "enforced",
      session: readerSession(),
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

  it("privileged session, policy on: send_payment allowed because principal was bound out of band", async () => {
    harness = await connectHarness({
      policyMode: "enforced",
      session: privilegedSession(),
    });
    const result = await harness.client.callTool({
      name: "send_payment",
      arguments: { payee: "vendor@example.com", amountCents: 42 },
    });
    expect(result.isError).toBeFalsy();
    expect(harness.workspaceLedgerLength()).toBe(1);
    expect(result.structuredContent).toMatchObject({
      payee: "vendor@example.com",
      requestedBy: "privileged",
    });
  });
});
