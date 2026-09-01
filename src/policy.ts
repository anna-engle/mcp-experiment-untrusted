/**
 * Server-side authorization. The model is not a principal.
 *
 * Tiny agent policy, bound out of band. Injected document text cannot
 * flip these flags.
 */
export const CAPABILITIES = ["document:read", "document:share"] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const AGENT_PERMISSIONS = {
  "document:read": true,
  "document:share": false,
} as const;

export type Session = {
  principalId: string;
  capabilities: ReadonlySet<Capability>;
};

export type PolicyDecision =
  | { allow: true }
  | { allow: false; reason: string };

export function agentSession(): Session {
  const capabilities = new Set<Capability>();
  if (AGENT_PERMISSIONS["document:read"]) {
    capabilities.add("document:read");
  }
  if (AGENT_PERMISSIONS["document:share"]) {
    capabilities.add("document:share");
  }
  return {
    principalId: "agent",
    capabilities,
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
