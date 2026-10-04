import { beforeEach, describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

const model = vi.hoisted(() => ({ generate: vi.fn(), review: vi.fn() }));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/decorators/transaction-runner", () => ({
  runInTransaction: (run: () => Promise<unknown>) => run(),
}));
vi.mock("../wiki-synthesis-model", () => ({
  generateWikiSynthesisObject: model.generate,
  wikiSynthesisWorstCaseMicrocents: () => 1_000,
}));
vi.mock("@/ee/agent-chat/classifier/metered", () => ({
  classifyMetered: model.review,
}));

import type { StoredWikiSynthesisTopic } from "../wiki-synthesis.schema";
import type { WikiCrawlRecord, WikiSourceRecord } from "../wiki-website-crawl.service";

import { WikiWebsiteSynthesisService } from "../wiki-website-synthesis.service";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const SOURCES: WikiSourceRecord[] = [
  {
    id: id(1),
    url: "https://example.com/",
    category: "about",
    title: "Example GmbH",
    text: "Example GmbH builds scheduling software for field service teams in Germany.",
    qaPairs: [],
    contentHash: "a",
    fetchedAt: new Date("2026-10-01T00:00:00.000Z"),
  },
  {
    id: id(2),
    url: "https://example.com/scheduling",
    category: "product",
    title: "Scheduling",
    text: "The scheduling module assigns technicians to jobs based on skills and location.",
    qaPairs: [],
    contentHash: "b",
    fetchedAt: new Date("2026-10-01T00:00:00.000Z"),
  },
];
const CHARGE = { model: "google/gemini-3.8-flash", inputTokens: 10, costMicrocents: 500, costSource: "measured" };

function harness(mode: WikiCrawlRecord["mode"] = "initial") {
  let crawl = {
    id: "crawl-1",
    userId: "user-1",
    homepageUrl: "https://example.com/",
    locale: "en",
    mode,
    status: "synthesizing",
    importedPages: 0,
    topics: null as StoredWikiSynthesisTopic[] | null,
  } as unknown as WikiCrawlRecord;
  const repo = {
    getCrawl: vi.fn(() => Promise.resolve(crawl)),
    updateCrawl: vi.fn((_id: string, patch: Partial<WikiCrawlRecord>) => {
      crawl = { ...crawl, ...patch };
      return Promise.resolve();
    }),
    claimCrawl: vi.fn((_id: string, _from: unknown, patch: Partial<WikiCrawlRecord>) => {
      crawl = { ...crawl, ...patch };
      return Promise.resolve(true);
    }),
    listSources: vi.fn(() => Promise.resolve(SOURCES)),
    findImportedPage: vi.fn(() => Promise.resolve(null)),
    listPageTitles: vi.fn(() => Promise.resolve([] as string[])),
    storePlannedTopics: vi.fn((_id: string, topics: StoredWikiSynthesisTopic[], failureReason: string | null) => {
      if (crawl.status === "synthesizing" && crawl.topics === null)
        crawl = { ...crawl, topics, ...(failureReason ? { failureReason } : {}) };
      return Promise.resolve();
    }),
    claimSynthesisTopic: vi.fn((_id: string, index: number, staleBefore: Date) => {
      const topic = crawl.topics?.[index];
      const stale = topic?.status === "writing" && (!topic.claimedAt || new Date(topic.claimedAt) < staleBefore);
      if (crawl.status !== "synthesizing" || (topic?.status !== "pending" && !stale)) return Promise.resolve(false);
      crawl = {
        ...crawl,
        topics: (crawl.topics ?? []).map((t, i) =>
          i === index ? { ...t, status: "writing" as const, claimedAt: new Date().toISOString() } : t,
        ),
      };
      return Promise.resolve(true);
    }),
    settleSynthesisTopic: vi.fn((_id: string, index: number, outcome: Partial<StoredWikiSynthesisTopic>) => {
      if (crawl.topics?.[index]?.status !== "writing") return Promise.resolve(false);
      crawl = {
        ...crawl,
        topics: crawl.topics.map(({ claimedAt: _claimedAt, ...t }, i) => (i === index ? { ...t, ...outcome } : t)),
      };
      return Promise.resolve(true);
    }),
  };
  const settled: unknown[] = [];
  const usage = {
    prepareRetrieval: vi.fn(() => Promise.resolve({ purpose: "wikiSynthesis" })),
    reserveRetrieval: vi.fn(() => Promise.resolve({ id: "reservation", reservedMicrocents: 1_000 })),
    settleRetrieval: vi.fn(({ charge }: { charge: unknown }) => {
      settled.push(charge);
      return Promise.resolve();
    }),
  };
  let page = 0;
  const created: Array<{ title: string; kind: string; markdown: string }> = [];
  const createPages = {
    invoke: vi.fn(({ pages }: { pages: Array<{ title: string; kind: string; markdown: string }> }) => {
      created.push(...pages);
      page += 1;
      return Promise.resolve({ ok: true, data: [{ id: id(100 + page) }] });
    }),
  };
  const service = new WikiWebsiteSynthesisService(repo as never, usage as never, createPages as never);
  const run = async () => {
    const count = await service.plan("crawl-1");
    for (let index = 0; index < count; index += 1) await service.writeTopic("crawl-1", index);
    await service.settle("crawl-1");
    return crawl;
  };
  return { service, repo, usage, settled, created, createPages, run, crawl: () => crawl };
}

const plan = (topics: Array<{ title: string; role: string; sources: string[] }>) => ({
  output: { topics },
  charge: CHARGE,
});
const citing = (source: string, quote: string, content = "The module assigns technicians by skills and location.") => ({
  output: {
    whenToUse: "",
    sections: [{ heading: "How it works", evidence: [{ source, quote }], content }],
    gaps: ["Which regions are supported?"],
  },
  charge: CHARGE,
});
const draft = (quote = SOURCES[1].text) => citing("s2", quote);
const verdict =
  (choice: "supported" | "qualified" | "unsupported") => (_use: unknown, spec: { questions: Array<{ id: string }> }) =>
    Promise.resolve({
      result: {
        model: "jev",
        answers: Object.fromEntries(
          spec.questions.map(({ id: question }) => [
            question,
            {
              type: "choice",
              choice: question === "page" ? "supported" : choice,
              probabilities: null,
              confidence: null,
            },
          ]),
        ),
        costMicrocents: 50,
        latencyMs: 1,
      },
      charge: { use: "wiki_synthesis_review", model: "jev", costMicrocents: 50, measured: true, answered: true },
    });

const FULL_PLAN = [
  { title: "Scheduling", role: "offering", sources: ["s2"] },
  { title: "Operating Guide", role: "operating_guide", sources: [] },
  { title: "Company overview", role: "company_overview", sources: ["s1", "s9"] },
  { title: "company overview", role: "offering", sources: ["s1"] },
  { title: "Second overview", role: "company_overview", sources: ["s1"] },
  { title: "Customers", role: "customers_and_use_cases", sources: ["s1"] },
];

beforeEach(() => {
  model.generate.mockReset();
  model.review.mockReset().mockImplementation(verdict("supported"));
});

describe("website Knowledge Base synthesis", () => {
  it("normalizes the plan: known sources only, one page per foundation, foundations first, guide last", async () => {
    const { service, crawl } = harness();
    model.generate.mockResolvedValueOnce(plan(FULL_PLAN));
    expect(await service.plan("crawl-1")).toBe(6);
    expect(model.generate.mock.calls[0][0].model.modelId).toBe("google/gemini-3.8-flash");
    expect(crawl().topics).toEqual([
      { title: "Company overview", role: "company_overview", sourceIds: [id(1)], status: "pending" },
      { title: "Customers", role: "customers_and_use_cases", sourceIds: [id(1)], status: "pending" },
      { title: "Sales messaging and FAQs", role: "sales_messaging", sourceIds: [id(1)], status: "pending" },
      { title: "Voice and tone", role: "voice_and_tone", sourceIds: [id(1)], status: "pending" },
      { title: "Scheduling", role: "offering", sourceIds: [id(2)], status: "pending" },
      { title: "Operating Guide", role: "operating_guide", sourceIds: [id(1)], status: "pending" },
    ]);
  });

  it("plans only offerings and procedures for a help-centre extension, on the ordinary model", async () => {
    const { service, crawl } = harness("extend");
    model.generate.mockResolvedValueOnce(plan(FULL_PLAN));
    expect(await service.plan("crawl-1")).toBe(2);
    expect(model.generate.mock.calls[0][0].model.modelId).toBe("google/gemini-3.5-flash-lite");
    expect(crawl().topics?.map(({ title, role }) => [title, role])).toEqual([
      ["Scheduling", "offering"],
      ["company overview", "offering"],
    ]);
  });

  it("keeps writing every planned page after one page is rejected, and links saved pages from the guide", async () => {
    const { run, created } = harness();
    model.generate.mockImplementation(({ prompt }: { prompt: string }) =>
      Promise.resolve(
        prompt.includes("\nWebsite:")
          ? plan(FULL_PLAN)
          : prompt.includes('key="s2"')
            ? draft()
            : citing("s1", SOURCES[0].text),
      ),
    );
    let reviews = 0;
    model.review.mockImplementation((use: unknown, spec: { questions: Array<{ id: string }> }) =>
      verdict(++reviews >= 2 && reviews <= 4 ? "unsupported" : "supported")(use, spec),
    );

    const final = await run();

    expect(final.status).toBe("completed");
    expect(final.topics?.map(({ title, status, skipReason }) => [title, status, skipReason])).toEqual([
      ["Company overview", "created", undefined],
      ["Customers", "skipped", "review"],
      ["Sales messaging and FAQs", "created", undefined],
      ["Voice and tone", "created", undefined],
      ["Scheduling", "created", undefined],
      ["Operating Guide", "created", undefined],
    ]);
    expect(created.map(({ title }) => title)).toEqual([
      "Company overview",
      "Sales messaging and FAQs",
      "Voice and tone",
      "Scheduling",
      "Operating Guide",
    ]);
    const guide = created[4];
    expect(guide.kind).toBe("guide");
    expect(guide.markdown).toContain(`[Company overview](/wiki?page=${id(101)})`);
    expect(guide.markdown).toContain(`[Scheduling](/wiki?page=${id(104)})`);
    expect(guide.markdown).toContain("## Sources");
    expect(guide.markdown).toContain("## Gaps to confirm");
  });

  it("repairs a draft whose evidence is not exact source text before reviewing it", async () => {
    const { run, created } = harness("extend");
    model.generate
      .mockResolvedValueOnce(plan([{ title: "Scheduling", role: "offering", sources: ["s2"] }]))
      .mockResolvedValueOnce(draft("Technicians are assigned automatically by an AI."))
      .mockResolvedValueOnce(draft());
    await run();
    expect(model.generate).toHaveBeenCalledTimes(3);
    expect(model.generate.mock.calls[2][0].prompt).toContain("copy every evidence quote exactly");
    expect(created).toHaveLength(1);
  });

  it("drops only the sections a review still rejects after repair", async () => {
    const { run, created } = harness("extend");
    const twoSections = {
      output: {
        whenToUse: "",
        sections: [
          {
            heading: "How it works",
            evidence: [{ source: "s2", quote: SOURCES[1].text }],
            content: "Skills and location.",
          },
          { heading: "Guarantee", evidence: [{ source: "s2", quote: SOURCES[1].text }], content: "Always on time." },
        ],
        gaps: [],
      },
      charge: CHARGE,
    };
    model.generate
      .mockResolvedValueOnce(plan([{ title: "Scheduling", role: "offering", sources: ["s2"] }]))
      .mockResolvedValue(twoSections);
    model.review.mockImplementation((_use: unknown, spec: { questions: Array<{ id: string }> }) =>
      Promise.resolve({
        result: {
          model: "jev",
          answers: Object.fromEntries(
            spec.questions.map(({ id: question }) => [
              question,
              {
                type: "choice",
                choice: question === "s1" ? "unsupported" : "supported",
                probabilities: null,
                confidence: null,
              },
            ]),
          ),
          costMicrocents: 50,
          latencyMs: 1,
        },
        charge: { use: "wiki_synthesis_review", model: "jev", costMicrocents: 50, measured: true, answered: true },
      }),
    );
    await run();
    expect(created).toHaveLength(1);
    expect(created[0].markdown).toContain("Skills and location.");
    expect(created[0].markdown).not.toContain("Always on time.");
  });

  it("retries an unanswered review once, then skips the page without stopping the import", async () => {
    const { run, crawl } = harness("extend");
    model.generate
      .mockResolvedValueOnce(
        plan([
          { title: "Scheduling", role: "offering", sources: ["s2"] },
          { title: "Dispatch", role: "offering", sources: ["s2"] },
        ]),
      )
      .mockResolvedValue(draft());
    let reviews = 0;
    model.review.mockImplementation((use: unknown, spec: { questions: Array<{ id: string }> }) =>
      ++reviews <= 2 ? Promise.resolve({ result: null, charge: null }) : verdict("supported")(use, spec),
    );
    await run();
    expect(crawl().topics?.map(({ status, skipReason }) => [status, skipReason])).toEqual([
      ["skipped", "reviewUnavailable"],
      ["created", undefined],
    ]);
    expect(crawl().status).toBe("completed");
  });

  it("ignores a closed crawl and never re-plans or re-writes it", async () => {
    const { service, crawl } = harness("refresh");
    await service.settle("crawl-1");
    crawl().status = "completed";
    expect(await service.plan("crawl-1")).toBe(0);
    expect(model.generate).not.toHaveBeenCalled();
  });

  it("resumes a topic whose writer stopped long ago, and saves it once", async () => {
    const { service, crawl, created } = harness("extend");
    model.generate
      .mockResolvedValueOnce(plan([{ title: "Scheduling", role: "offering", sources: ["s2"] }]))
      .mockResolvedValue(draft());
    await service.plan("crawl-1");
    const abandoned = new Date(Date.now() - 60 * 60 * 1_000).toISOString();
    crawl().topics = (crawl().topics ?? []).map((topic) => ({
      ...topic,
      status: "writing" as const,
      claimedAt: abandoned,
    }));
    await service.writeTopic("crawl-1", 0);
    await service.writeTopic("crawl-1", 0);
    expect(crawl().topics?.[0]).toMatchObject({ status: "created" });
    expect(created).toHaveLength(1);
  });

  it("never writes a topic twice while another delivery is writing it", async () => {
    const { service, crawl, created } = harness("extend");
    model.generate.mockResolvedValueOnce(plan([{ title: "Scheduling", role: "offering", sources: ["s2"] }]));
    await service.plan("crawl-1");
    crawl().topics = (crawl().topics ?? []).map((topic) => ({
      ...topic,
      status: "writing" as const,
      claimedAt: new Date().toISOString(),
    }));
    crawl().status = "completed";
    await service.writeTopic("crawl-1", 0);
    expect(model.generate).toHaveBeenCalledTimes(1);
    expect(created).toHaveLength(0);
  });

  it("keeps one stored plan when two deliveries plan concurrently", async () => {
    const { service, crawl } = harness("extend");
    model.generate
      .mockResolvedValueOnce(plan([{ title: "Scheduling", role: "offering", sources: ["s2"] }]))
      .mockResolvedValueOnce(
        plan([
          { title: "Dispatch", role: "offering", sources: ["s2"] },
          { title: "Routing", role: "offering", sources: ["s2"] },
        ]),
      );
    const counts = await Promise.all([service.plan("crawl-1"), service.plan("crawl-1")]);
    expect(crawl().topics?.map(({ title }) => title)).toEqual(["Scheduling"]);
    expect(counts).toEqual([1, 1]);
  });

  it("records a visible persistence failure and settles a failed import when nothing was saved", async () => {
    const { run, createPages, crawl } = harness("extend");
    model.generate
      .mockResolvedValueOnce(plan([{ title: "Scheduling", role: "offering", sources: ["s2"] }]))
      .mockResolvedValue(draft());
    createPages.invoke.mockResolvedValue({ ok: false, error: {} } as never);
    await run();
    expect(crawl().topics?.[0]).toMatchObject({ status: "skipped", skipReason: "persistence" });
    expect(crawl()).toMatchObject({ status: "failed", failureReason: "synthesis" });
  });

  it("stops spending when credits run out and reports credits as the reason", async () => {
    const { run, usage, crawl } = harness("extend");
    model.generate.mockResolvedValueOnce(plan([{ title: "Scheduling", role: "offering", sources: ["s2"] }]));
    usage.reserveRetrieval
      .mockResolvedValueOnce({ id: "plan", reservedMicrocents: 1_000 })
      .mockResolvedValue(null as never);
    await run();
    expect(model.generate).toHaveBeenCalledTimes(1);
    expect(crawl().topics?.[0]).toMatchObject({ status: "skipped", skipReason: "credits" });
    expect(crawl()).toMatchObject({ status: "failed", failureReason: "credits" });
  });

  it("settles every reserved model and review call with a charge, never as free usage", async () => {
    const { run, usage, settled } = harness("extend");
    model.generate
      .mockResolvedValueOnce(plan([{ title: "Scheduling", role: "offering", sources: ["s2"] }]))
      .mockResolvedValueOnce({ output: null, charge: { ...CHARGE, costSource: "estimated", costMicrocents: 777 } })
      .mockResolvedValue(draft());
    await run();
    expect(usage.reserveRetrieval).toHaveBeenCalledTimes(usage.settleRetrieval.mock.calls.length);
    expect(settled.every((charge) => charge !== null)).toBe(true);
    expect(settled).toContainEqual(expect.objectContaining({ costSource: "estimated", costMicrocents: 777 }));
  });

  it("writes nothing when the plan cannot be produced", async () => {
    const { run, crawl } = harness();
    model.generate.mockResolvedValue({ output: null, charge: CHARGE });
    await run();
    expect(model.generate).toHaveBeenCalledTimes(2);
    expect(crawl()).toMatchObject({ status: "failed", failureReason: "synthesis", topics: [] });
  });
});
