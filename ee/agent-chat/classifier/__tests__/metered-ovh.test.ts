import type { ClassifierSpec } from "../spec";

import { beforeEach, describe, expect, it, vi } from "vitest";

const envState = vi.hoisted(() => ({
  APP_MODE: "cloud" as "cloud" | "demo" | "self-hosted",
  OVH_AI_ENDPOINTS_API_KEY: undefined as string | undefined,
}));

vi.mock("@/env", () => ({ env: envState }));

import { computeCostMicrocents } from "../../model-pricing";
import { AGENT_MIN_BYTES_PER_PROVIDER_TOKEN, AGENT_PROVIDER_FRAMING_OVERHEAD_TOKENS } from "../../agent-model";
import { classifierReservationMicrocents } from "../classifier-reservation";
import { CLASSIFIER_MODELS } from "../models";
import { classifierMaxOutputTokens, ovhClassifierRequestBytes } from "../ovh-runner";
import { classifyMetered, collectClassifierCharges, estimateClassifierCostMicrocents } from "../metered";

const SPEC: ClassifierSpec = {
  id: "request",
  questions: [
    {
      id: "scope",
      type: "choice",
      instruction: "Whom does `message` concern?",
      options: { team: "team", records: "records" },
    },
  ],
};
const STATE = { message: "Invite Anna to the team." };
const MODEL = "ovh/Qwen3.8-27B";

function completion(usage: Record<string, number> | null = { prompt_tokens: 1_000, completion_tokens: 10 }) {
  return {
    id: "chatcmpl-test",
    object: "chat.completion",
    created: 1_790_000_000,
    model: "Qwen3.8-27B",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: JSON.stringify({ scope: { choice: "team" } }) },
        finish_reason: "stop",
      },
    ],
    ...(usage ? { usage } : {}),
  };
}

const MEASURED = computeCostMicrocents(
  MODEL,
  { inputTokens: 1_000, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
  "ovh",
  "eu",
);

const reply =
  (body: unknown, status = 200) =>
  () =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

beforeEach(() => {
  envState.APP_MODE = "cloud";
});

describe("classifier model per use", () => {
  it("reviews website imports on OVHcloud and re-ranks with Jev", () => {
    expect(CLASSIFIER_MODELS).toEqual({
      docs_rerank: "jev",
      wiki_rerank: "jev",
      wiki_synthesis_review: MODEL,
    });
  });
});

describe("metered OVHcloud classifier calls", () => {
  it("reserves the complete UTF-8 request with the shared provider token envelope and the output cap before spending", () => {
    const state = { message: "A conditional recommendation. 😀".repeat(200) };
    const bytes = ovhClassifierRequestBytes(SPEC, state, MODEL);
    expect(classifierReservationMicrocents(SPEC, state, MODEL)).toBe(
      computeCostMicrocents(
        MODEL,
        {
          inputTokens: Math.ceil(bytes / AGENT_MIN_BYTES_PER_PROVIDER_TOKEN) + AGENT_PROVIDER_FRAMING_OVERHEAD_TOKENS,
          outputTokens: classifierMaxOutputTokens(SPEC),
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        "ovh",
        "eu",
      ),
    );
    expect(classifierReservationMicrocents(SPEC, state, MODEL)).toBeGreaterThan(
      estimateClassifierCostMicrocents(SPEC, state, MODEL),
    );
  });

  it.each([200, 503])(
    "settles semantic reviews on the priced token usage or the sent-failure estimate (status=%i)",
    async (status) => {
      const { value, charges } = await collectClassifierCharges(() =>
        classifyMetered("wiki_synthesis_review", SPEC, STATE, MODEL, {
          apiKey: "k",
          fetch: reply(completion(), status),
        }),
      );
      expect(charges).toEqual([
        {
          use: "wiki_synthesis_review",
          model: MODEL,
          costMicrocents: status === 200 ? MEASURED : estimateClassifierCostMicrocents(SPEC, STATE, MODEL),
          measured: status === 200,
          answered: status === 200,
        },
      ]);
      expect(value.result === null).toBe(status !== 200);
    },
  );

  it("charges the priced token usage and hands it to the surrounding collector", async () => {
    const { value, charges } = await collectClassifierCharges(() =>
      classifyMetered("wiki_synthesis_review", SPEC, STATE, MODEL, { apiKey: "k", fetch: reply(completion()) }),
    );

    const expected = {
      use: "wiki_synthesis_review",
      model: MODEL,
      costMicrocents: MEASURED,
      measured: true,
      answered: true,
    };
    expect(MEASURED).toBeGreaterThan(0);
    expect(value.charge).toEqual(expected);
    expect(value.result?.answers.scope).toMatchObject({ choice: "team" });
    expect(charges).toEqual([expected]);
  });

  it.each([
    [429, "rateLimited"],
    [503, "unavailable"],
    [400, "rejected"],
    [408, "timeout"],
  ] as const)("names why an answered-with-%i classification produced nothing", async (status, failure) => {
    const { failure: reported } = await classifyMetered("wiki_synthesis_review", SPEC, STATE, MODEL, {
      apiKey: "k",
      fetch: reply({}, status),
    });
    expect(reported).toBe(failure);
  });

  it("names a timed-out and a malformed classification", async () => {
    const timedOut = await classifyMetered("wiki_synthesis_review", SPEC, STATE, MODEL, {
      apiKey: "k",
      fetch: () => Promise.reject(Object.assign(new Error("timed out"), { name: "TimeoutError" })),
    });
    expect(timedOut.failure).toBe("timeout");
    const malformed = await classifyMetered("wiki_synthesis_review", SPEC, STATE, MODEL, {
      apiKey: "k",
      fetch: reply({ ...completion(), choices: [{ index: 0, message: { role: "assistant", content: "{}" } }] }),
    });
    expect(malformed.failure).toBe("invalidAnswers");
    expect(malformed.charge).toMatchObject({ costMicrocents: MEASURED, measured: true, answered: false });
  });

  it("charges a pinned-price estimate when the call fails after it was sent", async () => {
    const { value, charges } = await collectClassifierCharges(() =>
      classifyMetered("wiki_synthesis_review", SPEC, STATE, MODEL, { apiKey: "k", fetch: reply({}, 503) }),
    );

    const estimate = estimateClassifierCostMicrocents(SPEC, STATE, MODEL);
    expect(estimate).toBeGreaterThan(0);
    expect(value).toEqual({
      result: null,
      charge: {
        use: "wiki_synthesis_review",
        model: MODEL,
        costMicrocents: estimate,
        measured: false,
        answered: false,
      },
      failure: "unavailable",
    });
    expect(charges).toHaveLength(1);
  });

  it.each([
    [429, "rateLimited"],
    [400, "rejected"],
    [401, "rejected"],
  ] as const)("charges nothing for a request OVHcloud refused with %i before generating", async (status, failure) => {
    const { value, charges } = await collectClassifierCharges(() =>
      classifyMetered("wiki_synthesis_review", SPEC, STATE, MODEL, { apiKey: "k", fetch: reply({}, status) }),
    );

    expect(value).toEqual({
      result: null,
      charge: { use: "wiki_synthesis_review", model: MODEL, costMicrocents: 0, measured: true, answered: false },
      failure,
    });
    expect(charges).toHaveLength(1);
  });

  it.each([408, 504])("keeps the sent-failure estimate for a %i that may have generated", async (status) => {
    const { value } = await collectClassifierCharges(() =>
      classifyMetered("wiki_synthesis_review", SPEC, STATE, MODEL, { apiKey: "k", fetch: reply({}, status) }),
    );

    expect(value.charge).toMatchObject({
      costMicrocents: estimateClassifierCostMicrocents(SPEC, STATE, MODEL),
      measured: false,
    });
  });

  it("estimates an answered call whose provider reported no token usage", async () => {
    const { value } = await collectClassifierCharges(() =>
      classifyMetered("wiki_synthesis_review", SPEC, STATE, MODEL, { apiKey: "k", fetch: reply(completion(null)) }),
    );

    expect(value.charge).toEqual({
      use: "wiki_synthesis_review",
      model: MODEL,
      costMicrocents: estimateClassifierCostMicrocents(SPEC, STATE, MODEL),
      measured: false,
      answered: true,
    });
  });

  it("charges nothing when no request could be sent", async () => {
    envState.OVH_AI_ENDPOINTS_API_KEY = undefined;
    const { value, charges } = await collectClassifierCharges(() =>
      classifyMetered("wiki_synthesis_review", SPEC, STATE, MODEL),
    );

    expect(value).toEqual({ result: null, charge: null });
    expect(charges).toEqual([]);
  });

  it("prices the estimate from the pinned OVH snapshot at three bytes per token plus the output cap", () => {
    const bytes = ovhClassifierRequestBytes(SPEC, STATE, MODEL);
    const tokens = {
      inputTokens: Math.ceil(bytes / 3),
      outputTokens: classifierMaxOutputTokens(SPEC),
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };

    expect(estimateClassifierCostMicrocents(SPEC, STATE, MODEL)).toBe(
      computeCostMicrocents(MODEL, tokens, "ovh", "eu"),
    );
    expect(computeCostMicrocents(MODEL, { ...tokens, inputTokens: 1_000_000, outputTokens: 0 }, "ovh", "eu")).toBe(
      47_000_000,
    );
  });
});
