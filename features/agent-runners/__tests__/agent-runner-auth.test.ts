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
import { Status } from "@/generated/prisma";

import {
  AGENT_RUNNER_TOKEN_PREFIX,
  agentRunnerTokenFromHeader,
  generateAgentRunnerToken,
  hashAgentRunnerToken,
} from "../agent-runner-token";
import { AgentRunnerAdmission } from "../agent-runner-admission";
import { AgentRunnerAuthenticator } from "../agent-runner-authenticator";
import { AGENT_RUNNER_LIMITS, AdmittedAgentRunner } from "../agent-runner.schema";

import {
  COMPANY_ID,
  OTHER_COMPANY_ID,
  OWNER_ID,
  RUNNER_ID,
  bearer,
  makeLimiters,
  makeRevocation,
} from "./agent-runner-fixtures";
import { FakeAgentRunnerRepo } from "./fake-agent-runner-repo";

const UNAUTHENTICATED = { ok: false, reason: "unauthenticated" };

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
  const NOW = new Date("2026-11-17T09:00:00.000Z");

  function setup() {
    const repo = new FakeAgentRunnerRepo();
    const limiters = makeLimiters();
    const revocation = makeRevocation();
    return {
      repo,
      limiters,
      revocation,
      authenticator: new AgentRunnerAuthenticator(repo, limiters, revocation, () => NOW),
    };
  }

  it("authenticates a stored runner by the hash of its token and names the member who added it", async () => {
    const { repo, authenticator, revocation } = setup();
    const { token } = repo.addRunner();

    const result = await authenticator.authenticate({ authorization: bearer(token) });

    expect(result).toEqual({
      ok: true,
      runner: { id: RUNNER_ID, companyId: COMPANY_ID, name: "Office laptop", createdById: OWNER_ID },
    });
    expect(revocation.revoked).toEqual([]);
  });

  it.each([Status.inactive, Status.pendingAuthorization])(
    "refuses and revokes the runner when the member who added it is %s",
    async (status) => {
      const { repo, authenticator, revocation } = setup();
      const { token } = repo.addRunner({ createdBy: { status, pausedByPlanAt: null } });

      const result = await authenticator.authenticate({ authorization: bearer(token) });

      expect(result).toEqual(UNAUTHENTICATED);
      expect(revocation.revoked).toEqual([{ companyId: COMPANY_ID, runnerId: RUNNER_ID, at: NOW }]);
    },
  );

  it("refuses the runner of a member the plan paused without revoking it, and admits it again when the pause ends", async () => {
    const { repo, authenticator, revocation } = setup();
    const { token, runner } = repo.addRunner({
      createdBy: { status: Status.inactive, pausedByPlanAt: new Date("2026-11-16T12:00:00.000Z") },
    });

    expect(await authenticator.authenticate({ authorization: bearer(token) })).toEqual(UNAUTHENTICATED);
    expect(await authenticator.authenticate({ authorization: bearer(token) })).toEqual(UNAUTHENTICATED);
    expect(revocation.revoked).toEqual([]);
    expect(repo.runners.get(runner.id)?.revokedAt).toBeNull();

    const stored = repo.runners.get(runner.id);
    if (stored) stored.createdBy = { status: Status.active, pausedByPlanAt: null };
    expect(await authenticator.authenticate({ authorization: bearer(token) })).toMatchObject({
      ok: true,
      runner: { id: runner.id },
    });
  });

  it("refuses a missing, malformed or unknown token", async () => {
    const { repo, authenticator } = setup();
    repo.addRunner();

    for (const authorization of [null, "Bearer nope", bearer(generateAgentRunnerToken())])
      expect(await authenticator.authenticate({ authorization })).toEqual(UNAUTHENTICATED);
  });

  it("refuses a revoked runner and a workspace that is being deleted, without revoking again", async () => {
    const { repo, authenticator, revocation } = setup();
    const revoked = repo.addRunner({ revokedAt: new Date("2026-11-16T11:00:00.000Z") });
    expect(await authenticator.authenticate({ authorization: bearer(revoked.token) })).toEqual(UNAUTHENTICATED);

    const deleting = repo.addRunner({
      id: "66666666-6666-4666-8666-666666666666",
      companyId: OTHER_COMPANY_ID,
      company: { deletingAt: new Date("2026-11-16T11:00:00.000Z") },
    });
    expect(await authenticator.authenticate({ authorization: bearer(deleting.token) })).toEqual(UNAUTHENTICATED);
    expect(revocation.revoked).toEqual([]);
  });

  it("limits requests per runner token and says when to retry", async () => {
    const repo = new FakeAgentRunnerRepo();
    const limiters = { runner: new TokenBucketRateLimiter(2, 60_000), visitor: makeLimiters().visitor };
    const authenticator = new AgentRunnerAuthenticator(repo, limiters, makeRevocation());
    const { token } = repo.addRunner();

    expect((await authenticator.authenticate({ authorization: bearer(token) })).ok).toBe(true);
    expect((await authenticator.authenticate({ authorization: bearer(token) })).ok).toBe(true);
    const limited = await authenticator.authenticate({ authorization: bearer(token) });

    expect(limited).toMatchObject({ ok: false, reason: "rateLimited" });
    expect(limited.ok === false && limited.reason === "rateLimited" && limited.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("limits unauthenticated requests per visitor before it looks anything up", async () => {
    const repo = new FakeAgentRunnerRepo();
    const lookup = vi.spyOn(repo, "findRunnerByTokenHashUnscoped");
    const limiters = { runner: makeLimiters().runner, visitor: new TokenBucketRateLimiter(1, 60_000) };
    const authenticator = new AgentRunnerAuthenticator(repo, limiters, makeRevocation());
    const reason = async (visitor: string) => {
      const result = await authenticator.authenticate({ authorization: bearer(generateAgentRunnerToken()), visitor });
      return result.ok ? "ok" : result.reason;
    };

    expect(await reason("abc")).toBe("unauthenticated");
    expect(await reason("abc")).toBe("rateLimited");
    expect(await reason("other")).toBe("unauthenticated");
    expect(lookup).toHaveBeenCalledTimes(2);
  });
});

describe("AgentRunnerAdmission", () => {
  const RUNNER = { id: RUNNER_ID, companyId: COMPANY_ID, name: "Office laptop", createdById: OWNER_ID };

  function admission(outcome: Awaited<ReturnType<AgentRunnerAuthenticator["authenticate"]>>) {
    const authenticate = vi.fn().mockResolvedValue(outcome);
    return { authenticate, admission: new AgentRunnerAdmission({ authenticate }) };
  }

  it("hands out the proof of admission for an authenticated runner", async () => {
    const { admission: service, authenticate } = admission({ ok: true, runner: RUNNER });

    const outcome = await service.admit({ authorization: "Bearer x", visitor: "v", contentLength: "120" });

    expect(outcome.ok && outcome.admission).toBeInstanceOf(AdmittedAgentRunner);
    expect(outcome.ok && outcome.admission.runner).toEqual(RUNNER);
    expect(authenticate).toHaveBeenCalledWith({ authorization: "Bearer x", visitor: "v", contentLength: "120" });
  });

  it("passes on why a runner was not authenticated, with the time to retry", async () => {
    const unknown = admission({ ok: false, reason: "unauthenticated" });
    const limited = admission({ ok: false, reason: "rateLimited", retryAfterSeconds: 7 });

    expect(await unknown.admission.admit({ authorization: "Bearer nope", contentLength: "2" })).toEqual({
      ok: false,
      reason: "unauthenticated",
    });
    expect(await limited.admission.admit({ authorization: "Bearer x", contentLength: "2" })).toEqual({
      ok: false,
      reason: "rateLimited",
      retryAfterSeconds: 7,
    });
  });

  it("refuses a body that declares more than the cap, and tells a stranger only that the token is unknown", async () => {
    const over = String(AGENT_RUNNER_LIMITS.maxBodyBytes + 1);
    const atCap = String(AGENT_RUNNER_LIMITS.maxBodyBytes);
    const authenticated = admission({ ok: true, runner: RUNNER });
    const unknown = admission({ ok: false, reason: "unauthenticated" });

    expect(await authenticated.admission.admit({ authorization: "Bearer x", contentLength: over })).toEqual({
      ok: false,
      reason: "bodyTooLarge",
    });
    expect(await unknown.admission.admit({ authorization: "Bearer nope", contentLength: over })).toEqual({
      ok: false,
      reason: "unauthenticated",
    });
    expect((await authenticated.admission.admit({ authorization: "Bearer x", contentLength: atCap })).ok).toBe(true);
    expect((await authenticated.admission.admit({ authorization: "Bearer x", contentLength: "0" })).ok).toBe(true);
  });

  it("refuses a body that does not declare its length, so a streamed body is never read", async () => {
    const authenticated = admission({ ok: true, runner: RUNNER });
    const unknown = admission({ ok: false, reason: "unauthenticated" });

    for (const contentLength of [undefined, null, "", "abc", "-1", "1e3", " 12", "12, 12", "0x10", "1".repeat(16)]) {
      expect(await authenticated.admission.admit({ authorization: "Bearer x", contentLength })).toEqual({
        ok: false,
        reason: "lengthRequired",
      });
    }
    expect(await unknown.admission.admit({ authorization: "Bearer nope" })).toEqual({
      ok: false,
      reason: "unauthenticated",
    });
  });
});
