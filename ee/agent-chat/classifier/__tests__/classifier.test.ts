import type { ClassifierSpec } from "../spec";

import { afterEach, describe, expect, it, vi } from "vitest";

const oidc = vi.hoisted(() => ({ token: vi.fn() }));
vi.mock("@vercel/oidc", () => ({ getVercelOidcToken: oidc.token }));

import { classifyAttempt } from "..";
import { JEV_DEADLINE_MS, JEV_EVALUATE_URL, jevRequestBody, runJev } from "../jev-runner";
import { classifierSpecProblems } from "../spec";

const SPEC: ClassifierSpec = {
  id: "request",
  questions: [
    {
      id: "intent",
      type: "choice",
      instruction: "What does `message` ask for?",
      options: { read: "look something up", write: "change something" },
    },
    {
      id: "scope",
      type: "choice",
      instruction: "Whom does `message` concern?",
      options: { team: "team members", records: "CRM records" },
    },
  ],
};

const STATE = { message: "Invite Anna to the team." };

function gatewayMetadata(provider: string, cost: string) {
  return {
    gateway: {
      routing: {
        finalProvider: provider,
        modelAttempts: [{ success: true, providerAttempts: [{ provider, credentialType: "system", success: true }] }],
      },
      cost,
      inferenceCost: cost,
      surchargeCost: "0",
      gatewayCost: cost,
    },
  };
}

const JEV_BODY = {
  answers: {
    intent: { type: "choice", choice: "write", probabilities: { read: 0.1, write: 0.9 }, confidence: 0.88 },
    scope: { type: "choice", choice: "team", confidence: 0.93 },
  },
  providerMetadata: gatewayMetadata("typesafe-ai", "0.000016002"),
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function replyWith(body: unknown, status = 200) {
  return () => Promise.resolve(jsonResponse(body, status));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("classifier spec", () => {
  it("accepts a well-formed spec", () => {
    expect(classifierSpecProblems(SPEC)).toEqual([]);
  });

  it("names every malformed question", () => {
    const problems = classifierSpecProblems({
      id: "broken",
      questions: [
        { id: "a", type: "choice", instruction: "Pick", options: { only: "one option" } },
        { id: "a", type: "choice", instruction: "Again", options: { x: "x", y: "y" } },
        { id: "Bad-Id", type: "choice", instruction: " ", options: { x: "x", "": "empty" } },
      ],
    });

    expect(problems).toEqual([
      'choice "a" needs 2 to 255 options',
      'question id "a" is used twice',
      'question id "Bad-Id" is not a lowercase identifier',
      'question "Bad-Id" has no instruction',
      'choice "Bad-Id" has an empty option key',
    ]);
  });
});

describe("Jev runner", () => {
  it("sends the spec as typed questions with zero data retention and no training on the TypeSafe route", () => {
    expect(jevRequestBody(SPEC, STATE)).toEqual({
      model: "typesafe-ai/jev",
      state: STATE,
      questions: {
        intent: {
          type: "choice",
          instructions: "What does `message` ask for?",
          criteria: { read: "look something up", write: "change something" },
        },
        scope: {
          type: "choice",
          instructions: "Whom does `message` concern?",
          criteria: { team: "team members", records: "CRM records" },
        },
      },
      providerOptions: {
        gateway: { only: ["typesafe-ai"], zeroDataRetention: true, disallowPromptTraining: true },
      },
    });
  });

  it("returns probabilities and the measured cost, with an 800 ms deadline", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const fetchMock = vi.fn(replyWith(JEV_BODY));

    const result = await runJev(SPEC, STATE, { apiKey: "test-key", fetch: fetchMock });

    expect(JEV_DEADLINE_MS).toBe(800);
    expect(timeout).toHaveBeenCalledWith(800);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(JEV_EVALUATE_URL);
    expect(init.headers).toEqual({
      Authorization: "Bearer test-key",
      "ai-gateway-auth-method": "api-key",
      "Content-Type": "application/json",
    });
    expect(result.model).toBe("jev");
    expect(result.costMicrocents).toBe(1600);
    expect(result.answers).toEqual({
      intent: {
        type: "choice",
        choice: "write",
        probabilities: { read: 0.1, write: 0.9 },
        confidence: 0.88,
        runnerUps: [],
      },
      scope: { type: "choice", choice: "team", probabilities: null, confidence: 0.93, runnerUps: [] },
    });
  });

  it("reports no cost when another provider served the call", async () => {
    const body = { ...JEV_BODY, providerMetadata: gatewayMetadata("digitalocean", "0.00001") };
    const result = await runJev(SPEC, STATE, { apiKey: "k", fetch: replyWith(body) });

    expect(result.costMicrocents).toBeNull();
  });

  it("preserves Gateway-proven unbilled work", async () => {
    const body = {
      ...JEV_BODY,
      providerMetadata: { gateway: { gatewayCost: "0", routing: { modelAttempts: [] } } },
    };

    const result = await runJev(SPEC, STATE, { apiKey: "k", fetch: replyWith(body) });

    expect(result.costMicrocents).toBe(0);
  });
});

describe("classifyAttempt", () => {
  it("runs Jev and reports the request as sent", async () => {
    const attempt = await classifyAttempt(SPEC, STATE, "jev", { apiKey: "k", fetch: replyWith(JEV_BODY) });

    expect(attempt.requested).toBe(true);
    expect(attempt.result?.answers.intent).toMatchObject({ choice: "write" });
  });

  it.each([
    ["an error status", replyWith({ error: "overloaded" }, 529), "unavailable"],
    ["a rate limit", replyWith({ error: "at capacity" }, 429), "rateLimited"],
    ["answers missing a question", replyWith({ answers: { intent: JEV_BODY.answers.intent } }), "invalidAnswers"],
    [
      "an unknown option",
      replyWith({ answers: { ...JEV_BODY.answers, intent: { type: "choice", choice: "delete" } } }),
      "invalidAnswers",
    ],
    ["a network failure", () => Promise.reject(new TypeError("fetch failed")), "network"],
  ] as const)("returns null on %s from Jev and names why", async (_label, fetchImpl, failure) => {
    expect(await classifyAttempt(SPEC, STATE, "jev", { apiKey: "k", fetch: fetchImpl })).toEqual({
      result: null,
      requested: true,
      failure,
    });
  });

  it("returns null when Jev misses its deadline", async () => {
    const slow = (_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });

    expect((await classifyAttempt(SPEC, STATE, "jev", { apiKey: "k", fetch: slow, timeoutMs: 10 })).result).toBeNull();
  });

  it("authenticates with the deployment's OIDC token when no API key is configured", async () => {
    oidc.token.mockResolvedValue("oidc-token");
    const fetchMock = vi.fn(replyWith(JEV_BODY));

    const attempt = await classifyAttempt(SPEC, STATE, "jev", { fetch: fetchMock });

    expect(attempt.requested).toBe(true);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toMatchObject({
      Authorization: "Bearer oidc-token",
      "ai-gateway-auth-method": "oidc",
    });
  });

  it("does not call Jev without an API key or an OIDC token", async () => {
    oidc.token.mockRejectedValue(new Error("no OIDC token outside Vercel"));
    const fetchMock = vi.fn(replyWith(JEV_BODY));

    expect(await classifyAttempt(SPEC, STATE, "jev", { fetch: fetchMock })).toEqual({ result: null, requested: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null for a malformed spec without calling any model", async () => {
    const fetchMock = vi.fn(replyWith(JEV_BODY));

    const attempt = await classifyAttempt({ id: "empty", questions: [] }, STATE, "jev", {
      apiKey: "k",
      fetch: fetchMock,
    });

    expect(attempt).toEqual({ result: null, requested: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
