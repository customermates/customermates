import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createZodError } from "@/core/validation/validation.utils";
import type { WikiCrawlRecord } from "../wiki-website-crawl.service";

vi.mock("@/i18n/get-translator", () => ({
  getTranslator: () => Promise.resolve(() => "Create the Wiki"),
}));

import { wikiCrawlSynthesisStarter } from "../wiki-crawl-synthesis";

const crawl = {
  clientRequestId: "00000000-0000-4000-8000-000000000001",
  homepageUrl: "https://example.com/",
  locale: "de",
} as WikiCrawlRecord;

const conversationId = "00000000-0000-4000-8000-000000000002";

function starter(result: unknown) {
  const invoke = vi.fn().mockResolvedValue(result);
  return { invoke, start: wikiCrawlSynthesisStarter({ invoke }) };
}

describe("Wiki crawl synthesis admission", () => {
  it.each(["run", "running", "completedReplay"])(
    "retains a %s conversation and durable request identity",
    async (disposition) => {
      const { start, invoke } = starter({ ok: true, data: { disposition, conversationId } });
      expect(await start(crawl)).toEqual({ conversationId, failureReason: null });
      expect(invoke).toHaveBeenCalledExactlyOnceWith({
        clientRequestId: crawl.clientRequestId,
        text: "Create the Wiki",
        locale: "de",
        retry: false,
        wikiHomepageSetupUrl: crawl.homepageUrl,
      });
    },
  );

  it("preserves the safe admission code without the translated message or input", async () => {
    const { start } = starter({
      ok: false,
      error: createZodError("private diagnostic text", [], { error: "agentLimitReached", kind: "rate_limit" }),
    });
    expect(await start(crawl)).toEqual({ conversationId: null, failureReason: "synthesisAdmission:agentLimitReached" });
  });

  it("uses the failure category when an unrecognized custom code contains private data", async () => {
    const { start } = starter({
      ok: false,
      error: new z.ZodError([
        { code: "custom", path: [], message: "private input", params: { error: "private input" } },
      ]),
    });
    expect(await start(crawl)).toEqual({ conversationId: null, failureReason: "synthesisAdmission:validation" });
  });

  it.each(["failed", "uncertain", "atCapacity", "conflict"])("preserves the %s disposition", async (disposition) => {
    const { start } = starter({ ok: true, data: { disposition, conversationId } });
    expect(await start(crawl)).toEqual({ conversationId: null, failureReason: `synthesisDisposition:${disposition}` });
  });

  it("does not mark an admitted result without a conversation as started", async () => {
    const { start } = starter({ ok: true, data: { disposition: "running" } });
    expect(await start(crawl)).toEqual({ conversationId: null, failureReason: "synthesisMissingConversation" });
  });
});
