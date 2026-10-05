import * as ai from "ai";
import { z } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";

const provider = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("ai", async (importOriginal) => ({ ...(await importOriginal<typeof ai>()), generateText: provider.generate }));

import { INITIAL_WIKI_SYNTHESIS_MODEL } from "@/ee/agent-chat/model-catalog";

import { generateWikiSynthesisObject, wikiSynthesisWorstCaseMicrocents } from "../wiki-synthesis-model";

function failure(statusCode: number) {
  return new ai.APICallError({ message: "failed", url: "https://gateway.invalid", requestBodyValues: {}, statusCode });
}

function rejectWith(error: Error) {
  provider.generate.mockImplementation(() => Promise.reject(error));
}

function call() {
  return generateWikiSynthesisObject({
    model: INITIAL_WIKI_SYNTHESIS_MODEL,
    schema: z.object({ title: z.string() }),
    system: "system",
    prompt: "prompt",
  });
}

beforeEach(() => {
  provider.generate.mockReset();
});

describe("generateWikiSynthesisObject", () => {
  it.each([400, 401, 403, 429])("charges nothing when the gateway rejects the request with %i", async (status) => {
    rejectWith(failure(status));
    expect(await call()).toMatchObject({ output: null, charge: null, failure: expect.stringContaining("failed") });
  });

  it.each(["GatewayAuthenticationError", "GatewayRateLimitError"])(
    "charges nothing when the gateway reports a %s",
    async (name) => {
      rejectWith(Object.assign(new Error("rejected"), { name }));
      expect(await call()).toMatchObject({ output: null, charge: null, failure: expect.stringContaining("failed") });
    },
  );

  it.each([408, 500, 503])("charges the worst case when a %i failure may have reached the model", async (status) => {
    rejectWith(failure(status));
    const { output, charge } = await call();
    expect(output).toBeNull();
    expect(charge).toMatchObject({
      costSource: "estimated",
      costMicrocents: wikiSynthesisWorstCaseMicrocents(INITIAL_WIKI_SYNTHESIS_MODEL, "system", "prompt"),
    });
  });

  it("charges the worst case when the request fails without a status", async () => {
    rejectWith(new Error("socket hang up"));
    expect((await call()).charge?.costMicrocents).toBe(
      wikiSynthesisWorstCaseMicrocents(INITIAL_WIKI_SYNTHESIS_MODEL, "system", "prompt"),
    );
  });
});
