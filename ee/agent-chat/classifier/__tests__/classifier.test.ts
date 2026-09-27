import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import type { ClassifierSpec } from "../spec";

import { MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { classify } from "..";
import { geminiOutputSchema, runGemini } from "../gemini-runner";
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
      id: "needs_admin",
      type: "boolean",
      instruction: "Does `message` manage team members?",
      criteria: { true: "invites or removes people", false: "anything else" },
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
    },
  };
}

const JEV_BODY = {
  answers: {
    intent: { type: "choice", choice: "write", probabilities: { read: 0.1, write: 0.9 }, confidence: 0.88 },
    needs_admin: { type: "boolean", probability: 0.93 },
  },
  providerMetadata: gatewayMetadata("typesafe-ai", "0.000016002"),
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function replyWith(body: unknown, status = 200) {
  return () => Promise.resolve(jsonResponse(body, status));
}

function geminiModel(text: string, providerMetadata: Record<string, unknown> = gatewayMetadata("vertex", "0.0004")) {
  const result: LanguageModelV4GenerateResult = {
    content: [{ type: "text", text }],
    finishReason: { unified: "stop", raw: "stop" },
    usage: {
      inputTokens: { total: 300, noCache: 300, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 20, text: 20, reasoning: 0 },
    },
    providerMetadata: providerMetadata as LanguageModelV4GenerateResult["providerMetadata"],
    warnings: [],
  };
  return new MockLanguageModelV4({ provider: "gateway", modelId: "google/gemini-3.5-flash-lite", doGenerate: result });
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
        { id: "a", type: "boolean", instruction: "Again" },
        { id: "Bad-Id", type: "boolean", instruction: " " },
      ],
    });

    expect(problems).toEqual([
      'choice "a" needs 2 to 255 options',
      'question id "a" is used twice',
      'question id "Bad-Id" is not a lowercase identifier',
      'question "Bad-Id" has no instruction',
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
        needs_admin: {
          type: "boolean",
          instructions: "Does `message` manage team members?",
          criteria: { true: "invites or removes people", false: "anything else" },
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
    expect(init.headers).toEqual({ Authorization: "Bearer test-key", "Content-Type": "application/json" });
    expect(result.model).toBe("jev");
    expect(result.costMicrocents).toBe(1600);
    expect(result.answers).toEqual({
      intent: { type: "choice", choice: "write", probabilities: { read: 0.1, write: 0.9 }, confidence: 0.88 },
      needs_admin: { type: "boolean", value: true, probability: 0.93 },
    });
  });

  it("reports no cost when another provider served the call", async () => {
    const body = { ...JEV_BODY, providerMetadata: gatewayMetadata("digitalocean", "0.00001") };
    const result = await runJev(SPEC, STATE, { apiKey: "k", fetch: replyWith(body) });

    expect(result.costMicrocents).toBeNull();
  });
});

describe("Gemini runner", () => {
  it("asks for one enum-typed object on Vertex in the EU zone with minimal thinking, ZDR and no training", async () => {
    const model = geminiModel(JSON.stringify({ intent: "write", needs_admin: false }));

    const result = await runGemini(SPEC, STATE, { model });

    const call = model.doGenerateCalls[0];
    expect(call.providerOptions).toEqual({
      gateway: {
        only: ["vertex"],
        inferenceRegion: { scope: "zone", geoRegion: "eu" },
        zeroDataRetention: true,
        disallowPromptTraining: true,
      },
      vertex: { thinkingConfig: { thinkingLevel: "minimal" } },
    });
    expect(call.temperature).toBe(0);
    expect(call.responseFormat).toMatchObject({ type: "json", schema: geminiOutputSchema(SPEC) });
    expect(result).toMatchObject({
      model: "gemini",
      costMicrocents: 40_000,
      answers: {
        intent: { type: "choice", choice: "write", probabilities: null, confidence: null },
        needs_admin: { type: "boolean", value: false, probability: null },
      },
    });
  });

  it("builds the output schema from the spec without word lists", () => {
    expect(geminiOutputSchema(SPEC)).toEqual({
      type: "object",
      properties: {
        intent: { type: "string", enum: ["read", "write"] },
        needs_admin: { type: "boolean" },
      },
      required: ["intent", "needs_admin"],
      additionalProperties: false,
    });
  });
});

describe("classify", () => {
  it("runs the chosen model", async () => {
    const jev = await classify(SPEC, STATE, "jev", { jev: { apiKey: "k", fetch: replyWith(JEV_BODY) } });
    const gemini = await classify(SPEC, STATE, "gemini", {
      gemini: { model: geminiModel(JSON.stringify({ intent: "read", needs_admin: true })) },
    });

    expect(jev?.answers.intent).toMatchObject({ choice: "write" });
    expect(gemini?.answers.intent).toMatchObject({ choice: "read" });
  });

  it.each([
    ["an error status", replyWith({ error: "overloaded" }, 529)],
    ["answers missing a question", replyWith({ answers: { intent: JEV_BODY.answers.intent } })],
    [
      "an unknown option",
      replyWith({ answers: { ...JEV_BODY.answers, intent: { type: "choice", choice: "delete" } } }),
    ],
    ["a network failure", () => Promise.reject(new TypeError("fetch failed"))],
  ])("returns null on %s from Jev", async (_label, fetchImpl) => {
    expect(await classify(SPEC, STATE, "jev", { jev: { apiKey: "k", fetch: fetchImpl } })).toBeNull();
  });

  it("returns null when Jev misses its deadline", async () => {
    const slow = (_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });

    expect(await classify(SPEC, STATE, "jev", { jev: { apiKey: "k", fetch: slow, timeoutMs: 10 } })).toBeNull();
  });

  it("returns null when Gemini answers outside the spec", async () => {
    const model = geminiModel(JSON.stringify({ intent: "delete", needs_admin: true }));

    expect(await classify(SPEC, STATE, "gemini", { gemini: { model } })).toBeNull();
  });

  it("returns null for a malformed spec without calling any model", async () => {
    const fetchMock = vi.fn(replyWith(JEV_BODY));

    const result = await classify({ id: "empty", questions: [] }, STATE, "jev", {
      jev: { apiKey: "k", fetch: fetchMock },
    });

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
