import type { ClassifierSpec } from "../spec";

import { beforeEach, describe, expect, it, vi } from "vitest";

const envState = vi.hoisted(() => ({
  APP_MODE: "cloud" as "cloud" | "demo" | "self-hosted",
  AGENT_DOCS_RERANK: "off" as "off" | "jev" | "gemini",
  AGENT_TOOLSET_CLASSIFIER: "off" as "off" | "jev" | "gemini",
  AI_GATEWAY_API_KEY: undefined as string | undefined,
}));

vi.mock("@/env", () => ({ env: envState }));

import { computeCostMicrocents } from "../../model-pricing";
import { JEV_MODEL_ID, JEV_PRICING_PROVIDER, jevRequestBody } from "../jev-runner";
import {
  classifyMetered,
  collectClassifierCharges,
  estimateClassifierCostMicrocents,
  hostedClassifierModel,
  hostedClassifierModelFor,
} from "../metered";

const SPEC: ClassifierSpec = {
  id: "request",
  questions: [{ id: "needs_admin", type: "boolean", instruction: "Does `message` manage team members?" }],
};
const STATE = { message: "Invite Anna to the team." };

function measuredBody(cost: string) {
  return {
    answers: { needs_admin: { type: "boolean", probability: 0.9 } },
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
  envState.AGENT_DOCS_RERANK = "off";
  envState.AGENT_TOOLSET_CLASSIFIER = "off";
});

describe("hosted classifier switches", () => {
  it("runs a classifier only when its switch names a model and the instance is not self-hosted", () => {
    expect(hostedClassifierModel("off")).toBeNull();
    expect(hostedClassifierModel("jev")).toBe("jev");
    envState.APP_MODE = "demo";
    expect(hostedClassifierModel("gemini")).toBe("gemini");
    envState.APP_MODE = "self-hosted";
    expect(hostedClassifierModel("jev")).toBeNull();
  });

  it("reads each use's own switch", () => {
    envState.AGENT_DOCS_RERANK = "jev";
    envState.AGENT_TOOLSET_CLASSIFIER = "gemini";

    expect(hostedClassifierModelFor("docs_rerank")).toBe("jev");
    expect(hostedClassifierModelFor("toolset_preload")).toBe("gemini");
  });
});

describe("metered classifier calls", () => {
  it("charges the measured gateway cost and hands it to the surrounding collector", async () => {
    const { value, charges } = await collectClassifierCharges(() =>
      classifyMetered("docs_rerank", SPEC, STATE, "jev", {
        jev: { apiKey: "k", fetch: reply(measuredBody("0.000016002")) },
      }),
    );

    const expected = { use: "docs_rerank", model: "jev", costMicrocents: 1600, measured: true, answered: true };
    expect(value.charge).toEqual(expected);
    expect(value.result?.answers.needs_admin).toMatchObject({ value: true });
    expect(charges).toEqual([expected]);
  });

  it("charges a pinned-price estimate when the call fails after it was sent", async () => {
    const { value, charges } = await collectClassifierCharges(() =>
      classifyMetered("toolset_preload", SPEC, STATE, "jev", { jev: { apiKey: "k", fetch: reply({}, 503) } }),
    );

    const estimate = estimateClassifierCostMicrocents("jev", SPEC, STATE);
    expect(estimate).toBeGreaterThan(0);
    expect(value).toEqual({
      result: null,
      charge: { use: "toolset_preload", model: "jev", costMicrocents: estimate, measured: false, answered: false },
    });
    expect(charges).toHaveLength(1);
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

    expect(estimateClassifierCostMicrocents("jev", SPEC, STATE)).toBe(
      computeCostMicrocents(JEV_MODEL_ID, tokens, JEV_PRICING_PROVIDER, null),
    );
    expect(computeCostMicrocents(JEV_MODEL_ID, { ...tokens, inputTokens: 1_000_000 }, JEV_PRICING_PROVIDER, null)).toBe(
      4_200_000,
    );
  });

  it("bounds the Gemini estimate by the classifier's output cap", () => {
    expect(estimateClassifierCostMicrocents("gemini", SPEC, STATE)).toBeGreaterThan(
      computeCostMicrocents("google/gemini-3.5-flash-lite", {
        inputTokens: 0,
        outputTokens: 1024,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      }) - 1,
    );
  });
});
