import { createHash, randomBytes } from "node:crypto";

export const AGENT_RUNNER_TOKEN_PREFIX = "cmr_";

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^cmr_[A-Za-z0-9_-]{43}$/u;
const BEARER = /^Bearer\s+(\S+)$/iu;

export function generateAgentRunnerToken(): string {
  return `${AGENT_RUNNER_TOKEN_PREFIX}${randomBytes(TOKEN_BYTES).toString("base64url")}`;
}

export function hashAgentRunnerToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function agentRunnerTokenFromHeader(authorization: string | null | undefined): string | null {
  const token = authorization ? BEARER.exec(authorization.trim())?.[1] : undefined;
  return token && TOKEN_PATTERN.test(token) ? token : null;
}
