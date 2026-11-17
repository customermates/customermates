import { describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE, MOCK_PRISMA_DB_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
  getLocale: () => Promise.resolve("en"),
}));

import { TokenBucketRateLimiter } from "@/core/network/token-bucket-rate-limiter";
import { CustomErrorCode } from "@/core/validation/validation.types";

import {
  AGENT_RUNNER_TOKEN_PREFIX,
  agentRunnerTokenFromHeader,
  generateAgentRunnerToken,
  hashAgentRunnerToken,
} from "../agent-runner-token";
import { AgentRunnerAuthenticator } from "../agent-runner-authenticator";

import {
  COMPANY_ID,
  OTHER_COMPANY_ID,
  RUNNER_ID,
  bearer,
  codeOf,
  makeLimiters,
  statusOf,
} from "./agent-runner-fixtures";
import { FakeAgentRunnerRepo } from "./fake-agent-runner-repo";

describe("runner tokens", () => {
  it("issues a prefixed random token of 32 bytes that differs on every call", () => {
    const first = generateAgentRunnerToken();
    const second = generateAgentRunnerToken();

    expect(first.startsWith(AGENT_RUNNER_TOKEN_PREFIX)).toBe(true);
    expect(first).toMatch(/^cmr_[A-Za-z0-9_-]{43}$/u);
    expect(first).not.toBe(second);
  });

  it("stores only the SHA-256 of the token and never the token itself", () => {
    const token = generateAgentRunnerToken();
    const hash = hashAgentRunnerToken(token);

    expect(hash).toMatch(/^[0-9a-f]{64}$/u);
    expect(hash).not.toContain(token);
    expect(hashAgentRunnerToken(token)).toBe(hash);
    expect(hashAgentRunnerToken(`${token}x`)).not.toBe(hash);
  });

  it("reads a bearer token only when it has the shape of a runner token", () => {
    const token = generateAgentRunnerToken();

    expect(agentRunnerTokenFromHeader(`Bearer ${token}`)).toBe(token);
    expect(agentRunnerTokenFromHeader(`bearer   ${token}  `)).toBe(token);
    expect(agentRunnerTokenFromHeader(token)).toBeNull();
    expect(agentRunnerTokenFromHeader(`Basic ${token}`)).toBeNull();
    expect(agentRunnerTokenFromHeader("Bearer not-a-runner-token")).toBeNull();
    expect(agentRunnerTokenFromHeader(`Bearer ${token.slice(0, -1)}`)).toBeNull();
    expect(agentRunnerTokenFromHeader(null)).toBeNull();
    expect(agentRunnerTokenFromHeader(undefined)).toBeNull();
  });
});

describe("AgentRunnerAuthenticator", () => {
  function setup() {
    const repo = new FakeAgentRunnerRepo();
    const limiters = makeLimiters();
    return { repo, limiters, authenticator: new AgentRunnerAuthenticator(repo, limiters) };
  }

  it("authenticates a stored runner by the hash of its token", async () => {
    const { repo, authenticator } = setup();
    const { token } = repo.addRunner();

    const result = await authenticator.authenticate({ authorization: bearer(token) });

    expect(result).toEqual({ ok: true, runner: { id: RUNNER_ID, companyId: COMPANY_ID, name: "Office laptop" } });
  });

  it("answers 401 for a missing, malformed or unknown token", async () => {
    const { repo, authenticator } = setup();
    repo.addRunner();

    for (const authorization of [null, "Bearer nope", bearer(generateAgentRunnerToken())]) {
      const result = await authenticator.authenticate({ authorization });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(statusOf(result.failure)).toBe(401);
        expect(codeOf(result.failure)).toBe(CustomErrorCode.notAuthenticated);
      }
    }
  });

  it("answers 401 for a revoked runner and for a workspace that is being deleted", async () => {
    const { repo, authenticator } = setup();
    const revoked = repo.addRunner({ revokedAt: new Date("2026-11-16T11:00:00.000Z") });
    const revokedResult = await authenticator.authenticate({ authorization: bearer(revoked.token) });
    expect(revokedResult.ok).toBe(false);
    if (!revokedResult.ok) expect(statusOf(revokedResult.failure)).toBe(401);

    const deleting = repo.addRunner({
      id: "66666666-6666-4666-8666-666666666666",
      companyId: OTHER_COMPANY_ID,
      company: { deletingAt: new Date("2026-11-16T11:00:00.000Z") },
    });
    const deletingResult = await authenticator.authenticate({ authorization: bearer(deleting.token) });
    expect(deletingResult.ok).toBe(false);
    if (!deletingResult.ok) expect(statusOf(deletingResult.failure)).toBe(401);
  });

  it("limits requests per runner token and answers 429", async () => {
    const repo = new FakeAgentRunnerRepo();
    const limiters = { runner: new TokenBucketRateLimiter(2, 60_000), visitor: makeLimiters().visitor };
    const authenticator = new AgentRunnerAuthenticator(repo, limiters);
    const { token } = repo.addRunner();

    expect((await authenticator.authenticate({ authorization: bearer(token) })).ok).toBe(true);
    expect((await authenticator.authenticate({ authorization: bearer(token) })).ok).toBe(true);
    const limited = await authenticator.authenticate({ authorization: bearer(token) });

    expect(limited.ok).toBe(false);
    if (!limited.ok) {
      expect(statusOf(limited.failure)).toBe(429);
      expect(codeOf(limited.failure)).toBe(CustomErrorCode.apiRateLimitReached);
    }
  });

  it("limits unauthenticated requests per visitor before it looks anything up", async () => {
    const repo = new FakeAgentRunnerRepo();
    const lookup = vi.spyOn(repo, "findRunnerByTokenHashUnscoped");
    const limiters = { runner: makeLimiters().runner, visitor: new TokenBucketRateLimiter(1, 60_000) };
    const authenticator = new AgentRunnerAuthenticator(repo, limiters);
    const status = async (visitor: string) => {
      const result = await authenticator.authenticate({ authorization: bearer(generateAgentRunnerToken()), visitor });
      return result.ok ? 200 : statusOf(result.failure);
    };

    expect(await status("abc")).toBe(401);
    expect(await status("abc")).toBe(429);
    expect(await status("other")).toBe(401);
    expect(lookup).toHaveBeenCalledTimes(2);
  });
});
