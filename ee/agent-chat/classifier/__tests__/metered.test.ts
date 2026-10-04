import type { ClassifierSpec } from "../spec";

import { beforeEach, describe, expect, it, vi } from "vitest";

const envState = vi.hoisted(() => ({
  APP_MODE: "cloud" as "cloud" | "demo" | "self-hosted",
  AI_GATEWAY_API_KEY: undefined as string | undefined,
}));

vi.mock("@/env", () => ({ env: envState }));

import { computeCostMicrocents } from "../../model-pricing";
import { AGENT_MIN_BYTES_PER_PROVIDER_TOKEN, AGENT_PROVIDER_FRAMING_OVERHEAD_TOKENS } from "../../agent-model";
import { classifierReservationMicrocents } from "../classifier-reservation";
import { JEV_MODEL_ID, JEV_PRICING_PROVIDER, jevRequestBody } from "../jev-runner";
import {
  classifyMetered,
  collectClassifierCharges,
  estimateClassifierCostMicrocents,
  hostedDocsRerankModel,
} from "../metered";

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

function measuredBody(cost: string) {
  return {
    answers: { scope: { type: "choice", choice: "team" } },
    providerMetadata: {
      gateway: {
        routing: {
          finalProvider: "typesafe-ai",
          modelAttempts: [
            { success: true, providerAttempts: [{ provider: "typesafe-ai", credentialType: "system", success: true }] },
          ],
        },
        cost,
        inferenceCost: cost,
        surchargeCost: "0",
        gatewayCost: cost,
      },
    },
  };
}

const reply =
  (body: unknown, status = 200) =>
  () =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

beforeEach(() => {
  envState.APP_MODE = "cloud";
});

describe("hosted docs re-rank switch", () => {
  it("runs Jev on every hosted instance", () => {
    expect(hostedDocsRerankModel()).toBe("jev");
    envState.APP_MODE = "demo";
    expect(hostedDocsRerankModel()).toBe("jev");
  });

  it("never runs self-hosted", () => {
    envState.APP_MODE = "self-hosted";
    expect(hostedDocsRerankModel()).toBeNull();
  });
});

describe("metered classifier calls", () => {
  it("reserves the complete UTF-8 request with the shared provider token envelope before spending", () => {
    const state = { message: "A conditional recommendation. 😀".repeat(200) };
    const bytes = Buffer.byteLength(JSON.stringify(jevRequestBody(SPEC, state)), "utf8");
    expect(classifierReservationMicrocents(SPEC, state, "jev")).toBe(
      computeCostMicrocents(
        JEV_MODEL_ID,
        {
          inputTokens: Math.ceil(bytes / AGENT_MIN_BYTES_PER_PROVIDER_TOKEN) + AGENT_PROVIDER_FRAMING_OVERHEAD_TOKENS,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        JEV_PRICING_PROVIDER,
        null,
      ),
    );
    expect(classifierReservationMicrocents(SPEC, state, "jev")).toBeGreaterThan(
      estimateClassifierCostMicrocents(SPEC, state, "jev"),
    );
  });

  it.each([200, 503])(
    "settles semantic reviews through the existing actual receipt or sent-failure fallback (status=%i)",
    async (status) => {
      const { value, charges } = await collectClassifierCharges(() =>
        classifyMetered("wiki_synthesis_review", SPEC, STATE, "jev", {
          apiKey: "k",
          fetch: reply(measuredBody("0.000016002"), status),
        }),
      );
      expect(charges).toEqual([
        {
          use: "wiki_synthesis_review",
          model: "jev",
          costMicrocents: status === 200 ? 1600 : estimateClassifierCostMicrocents(SPEC, STATE, "jev"),
          measured: status === 200,
          answered: status === 200,
        },
      ]);
      expect(value.result === null).toBe(status !== 200);
    },
  );
  it("charges the measured gateway cost and hands it to the surrounding collector", async () => {
    const { value, charges } = await collectClassifierCharges(() =>
      classifyMetered("docs_rerank", SPEC, STATE, "jev", { apiKey: "k", fetch: reply(measuredBody("0.000016002")) }),
    );

    const expected = { use: "docs_rerank", model: "jev", costMicrocents: 1600, measured: true, answered: true };
    expect(value.charge).toEqual(expected);
    expect(value.result?.answers.scope).toMatchObject({ choice: "team" });
    expect(charges).toEqual([expected]);
  });

  it.each([
    [429, "rateLimited"],
    [503, "unavailable"],
    [400, "rejected"],
  ] as const)("names why an answered-with-%i evaluation produced nothing", async (status, failure) => {
    const { failure: reported } = await classifyMetered("wiki_synthesis_review", SPEC, STATE, "jev", {
      apiKey: "k",
      fetch: reply({}, status),
    });
    expect(reported).toBe(failure);
  });

  it("names a timed-out and a malformed evaluation", async () => {
    const timedOut = await classifyMetered("wiki_synthesis_review", SPEC, STATE, "jev", {
      apiKey: "k",
      fetch: () => Promise.reject(Object.assign(new Error("timed out"), { name: "TimeoutError" })),
    });
    expect(timedOut.failure).toBe("timeout");
    const malformed = await classifyMetered("wiki_synthesis_review", SPEC, STATE, "jev", {
      apiKey: "k",
      fetch: reply({ answers: { unknown: {} } }),
    });
    expect(malformed.failure).toBe("invalidAnswers");
  });

  it("charges a pinned-price estimate when the call fails after it was sent", async () => {
    const { value, charges } = await collectClassifierCharges(() =>
      classifyMetered("docs_rerank", SPEC, STATE, "jev", { apiKey: "k", fetch: reply({}, 503) }),
    );

    const estimate = estimateClassifierCostMicrocents(SPEC, STATE, "jev");
    expect(estimate).toBeGreaterThan(0);
    expect(value).toEqual({
      result: null,
      charge: { use: "docs_rerank", model: "jev", costMicrocents: estimate, measured: false, answered: false },
      failure: "unavailable",
    });
    expect(charges).toHaveLength(1);
  });

  it.each([true, false])("distinguishes proven unbilled work from incomplete routing (proven=%s)", async (proven) => {
    const body = {
      answers: measuredBody("0").answers,
      providerMetadata: { gateway: { gatewayCost: "0", routing: proven ? { modelAttempts: [] } : {} } },
    };
    const { value, charges } = await collectClassifierCharges(() =>
      classifyMetered("docs_rerank", SPEC, STATE, "jev", { apiKey: "k", fetch: reply(body) }),
    );

    const expected = {
      use: "docs_rerank",
      model: "jev",
      costMicrocents: proven ? 0 : estimateClassifierCostMicrocents(SPEC, STATE, "jev"),
      measured: proven,
      answered: true,
    };
    expect(value.charge).toEqual(expected);
    expect(charges).toEqual([expected]);
    expect(value.result?.answers.scope).toMatchObject({ choice: "team" });
  });

  it("charges nothing when no request could be sent", async () => {
    envState.AI_GATEWAY_API_KEY = undefined;
    const { value, charges } = await collectClassifierCharges(() => classifyMetered("docs_rerank", SPEC, STATE, "jev"));

    expect(value).toEqual({ result: null, charge: null });
    expect(charges).toEqual([]);
  });

  it("prices the Jev estimate from the pinned snapshot at three bytes per token", () => {
    const bytes = Buffer.byteLength(JSON.stringify(jevRequestBody(SPEC, STATE)), "utf8");
    const tokens = { inputTokens: Math.ceil(bytes / 3), outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

    expect(estimateClassifierCostMicrocents(SPEC, STATE, "jev")).toBe(
      computeCostMicrocents(JEV_MODEL_ID, tokens, JEV_PRICING_PROVIDER, null),
    );
    expect(computeCostMicrocents(JEV_MODEL_ID, { ...tokens, inputTokens: 1_000_000 }, JEV_PRICING_PROVIDER, null)).toBe(
      4_200_000,
    );
  });
});
