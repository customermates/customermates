import crypto from "node:crypto";

import { env } from "@/env";

/**
 * Run-scoped data token. The sandbox presents this to the read-only broker; the
 * broker derives {companyId, userId} from it SERVER-SIDE and never trusts any
 * tenant id the sandboxed code might send. It is HMAC-signed, short-lived (TTL
 * <= the run timeout), and bound to a single run via `jti`. Stateless by design;
 * a DB-backed single-use nonce is a hardening follow-up (task #27).
 */
export type RunTokenClaims = {
  companyId: string;
  userId: string;
  // A token is minted only for data-enabled runs. NET-mode runs get no token at
  // all, so the data wall holds by construction; this claim is belt-and-suspenders
  // (and the seam for a future DATA_NET mode).
  mode: "DATA";
  jti: string;
  exp: number; // epoch ms
};

function secret(): string {
  const s = env.SANDBOX_TOKEN_SECRET;
  if (!s) throw new Error("SANDBOX_TOKEN_SECRET (or BETTER_AUTH_SECRET) must be set to run sandboxed code");
  return s;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function issueRunToken(input: { companyId: string; userId: string; ttlMs: number }): {
  token: string;
  claims: RunTokenClaims;
} {
  const claims: RunTokenClaims = {
    companyId: input.companyId,
    userId: input.userId,
    mode: "DATA",
    jti: crypto.randomUUID(),
    exp: Date.now() + input.ttlMs,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return { token: `${payload}.${sign(payload)}`, claims };
}

/** Returns the claims if the token is well-formed, untampered, and unexpired; else null. */
export function verifyRunToken(token: string): RunTokenClaims | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);

  const expectedSig = sign(payload);
  const a = Uint8Array.from(Buffer.from(providedSig));
  const b = Uint8Array.from(Buffer.from(expectedSig));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let claims: RunTokenClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (
    !claims ||
    typeof claims.companyId !== "string" ||
    typeof claims.userId !== "string" ||
    typeof claims.jti !== "string" ||
    typeof claims.exp !== "number" ||
    claims.mode !== "DATA"
  )
    return null;

  if (Date.now() > claims.exp) return null;
  return claims;
}
