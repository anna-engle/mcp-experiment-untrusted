/**
 * Server-side authorization. The model is not a principal.
 *
 * Capabilities are bound to the MCP session when it is created (out of band).
 * Tool arguments, resource text, and "the model said I am admin" never
 * enlarge that set.
 */

export const CAPABILITIES = ["files:read", "payments:send"] as const;
export type Capability = (typeof CAPABILITIES)[number];

export type Session = {
  principalId: string;
  capabilities: ReadonlySet<Capability>;
};

export type PolicyDecision =
  | { allow: true }
  | { allow: false; reason: string };

/** Default session: can read documents, cannot send payments. */
export function readerSession(): Session {
  return {
    principalId: "reader",
    capabilities: new Set(["files:read"]),
  };
}

/** Same reads, plus payments. Bound out of band — not by tool args. */
export function privilegedSession(): Session {
  return {
    principalId: "privileged",
    capabilities: new Set(["files:read", "payments:send"]),
  };
}

export function authorize(
  session: Session,
  required: Capability,
): PolicyDecision {
  if (session.capabilities.has(required)) {
    return { allow: true };
  }
  return {
    allow: false,
    reason: `principal "${session.principalId}" lacks capability "${required}"`,
  };
}

/**
 * "Claim admin" is the confused-deputy bait: injected text tells the model
 * to call this to expand authority. The server never grants capabilities
 * from a tool call. A matching out-of-band token is the only path, and that
 * token is not stored in the workspace.
 */
export function evaluateClaimAdmin(input: {
  session: Session;
  offeredToken: string;
  outOfBandAdminToken: string | undefined;
}): PolicyDecision {
  if (!input.outOfBandAdminToken) {
    return {
      allow: false,
      reason: "no out-of-band admin token is configured for this process",
    };
  }
  if (input.offeredToken !== input.outOfBandAdminToken) {
    return { allow: false, reason: "admin token mismatch" };
  }
  return { allow: true };
}
