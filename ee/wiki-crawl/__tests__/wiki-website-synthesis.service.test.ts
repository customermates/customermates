import { beforeEach, describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

const model = vi.hoisted(() => ({ generate: vi.fn(), review: vi.fn() }));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/decorators/transaction-runner", () => ({
  runInTransaction: (run: () => Promise<unknown>) => run(),
}));
vi.mock("@/ee/agent-chat/structured-model-call", () => ({
  generateStructuredObject: model.generate,
  structuredCallWorstCaseMicrocents: () => 1_000,
}));
vi.mock("@/ee/agent-chat/classifier/metered", () => ({
  classifyMetered: model.review,
}));

import type { StoredWikiSynthesisTopic } from "../wiki-synthesis.schema";
import type { WikiSynthesisBriefState } from "../wiki-synthesis-brief";
import type { WikiCrawlRecord, WikiSourceRecord } from "../wiki-website-crawl.service";

import { AGENT_MODELS } from "@/ee/agent-chat/model-catalog";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { createMockUser } from "@/tests/helpers/mock-user";
import {
  WORKSPACE_SETUP_PLATFORM_PURPOSE,
  WORKSPACE_SETUP_SPEND_CAP_MICROCENTS,
} from "@/ee/workspace-setup/workspace-setup-spend";

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

function harness(
  mode: WikiCrawlRecord["mode"] = "initial",
  payer: WikiCrawlRecord["payer"] = "requester",
  brief: WikiSynthesisBriefState = { status: "none" },
) {
  let crawl = {
    id: "crawl-1",
    userId: "user-1",
    homepageUrl: "https://example.com/",
    locale: "en",
    mode,
    payer,
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
    retrievalRefusal: vi.fn(() => Promise.resolve("credits" as "credits" | "unavailable")),
    settleRetrieval: vi.fn(({ charge }: { charge: unknown }) => {
      settled.push(charge);
      return Promise.resolve();
    }),
    reserveWorkspacePlatform: vi.fn(
      (): Promise<{ status: "reserved"; id: string } | { status: "cap" | "unavailable" }> =>
        Promise.resolve({ status: "reserved", id: "setup-hold" }),
    ),
    settlePlatformRetrieval: vi.fn(({ charge }: { charge: unknown }) => {
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
  const briefs = { brief: vi.fn((_crawl: unknown, _giveUp: boolean) => Promise.resolve(brief)) };
  const service = new WikiWebsiteSynthesisService(repo as never, usage as never, createPages as never, briefs);
  const run = async () => {
    const count = await service.plan("crawl-1");
    if (count === "wait") return crawl;
    for (let index = 0; index < count; index += 1) await service.writeTopic("crawl-1", index);
    await service.settle("crawl-1");
    return crawl;
  };
  return { service, repo, usage, settled, created, createPages, briefs, run, crawl: () => crawl };
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
    expect(model.generate.mock.calls[0][0].model).toBe(AGENT_MODELS.wikiSynthesis);
    expect(crawl().topics).toEqual([
      { title: "Company overview", role: "company_overview", sourceIds: [id(1)], status: "pending" },
      { title: "Customers", role: "customers_and_use_cases", sourceIds: [id(1)], status: "pending" },
      { title: "Sales messaging and FAQs", role: "sales_messaging", sourceIds: [id(1)], status: "pending" },
      { title: "Voice and tone", role: "voice_and_tone", sourceIds: [id(1)], status: "pending" },
      { title: "Scheduling", role: "offering", sourceIds: [id(2)], status: "pending" },
      { title: "Operating Guide", role: "operating_guide", sourceIds: [id(1)], status: "pending" },
    ]);
  });

  it("plans only offerings and procedures for a help-centre extension, on the same synthesis model", async () => {
    const { service, crawl } = harness("extend");
    model.generate.mockResolvedValueOnce(plan(FULL_PLAN));
    expect(await service.plan("crawl-1")).toBe(2);
    expect(model.generate.mock.calls[0][0].model).toBe(AGENT_MODELS.wikiSynthesis);
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

  it("waits and retries a rate-limited review, and names the failures when it stays unanswered", async () => {
    vi.useFakeTimers();
    try {
      const { run, crawl, service } = harness("extend");
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
        ++reviews <= 3
          ? Promise.resolve({ result: null, charge: null, failure: "rateLimited" })
          : verdict("supported")(use, spec),
      );
      const done = run();
      await vi.runAllTimersAsync();
      await done;
      expect(reviews).toBe(4);
      expect(crawl().topics?.map(({ status, skipReason }) => [status, skipReason])).toEqual([
        ["skipped", "reviewUnavailable"],
        ["created", undefined],
      ]);
      expect(service.drainWarnings()).toContain(
        "Website import review by typesafe-ai/jev was unanswered after 3 attempts (rateLimited, rateLimited, rateLimited).",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("recovers a review after one transient failure", async () => {
    vi.useFakeTimers();
    try {
      const { run, crawl } = harness("extend");
      model.generate
        .mockResolvedValueOnce(plan([{ title: "Scheduling", role: "offering", sources: ["s2"] }]))
        .mockResolvedValue(draft());
      let reviews = 0;
      model.review.mockImplementation((use: unknown, spec: { questions: Array<{ id: string }> }) =>
        ++reviews === 1
          ? Promise.resolve({ result: null, charge: null, failure: "timeout" })
          : verdict("supported")(use, spec),
      );
      const done = run();
      await vi.runAllTimersAsync();
      await done;
      expect(crawl().topics?.[0]).toMatchObject({ status: "created" });
    } finally {
      vi.useRealTimers();
    }
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

  it("reports hosted AI as unavailable, not as missing credits, when the refusal is not about credits", async () => {
    const { run, usage, crawl } = harness("extend");
    model.generate.mockResolvedValueOnce(plan([{ title: "Scheduling", role: "offering", sources: ["s2"] }]));
    usage.reserveRetrieval
      .mockResolvedValueOnce({ id: "plan", reservedMicrocents: 1_000 })
      .mockResolvedValue(null as never);
    usage.retrievalRefusal.mockResolvedValue("unavailable");
    await run();
    expect(model.generate).toHaveBeenCalledTimes(1);
    expect(crawl().topics?.[0]).toMatchObject({ status: "skipped", skipReason: "aiUnavailable" });
    expect(crawl()).toMatchObject({ status: "failed", failureReason: "aiUnavailable" });
  });

  it("reports the real refusal when no plan can be reserved", async () => {
    const { run, usage, crawl } = harness("extend");
    usage.prepareRetrieval.mockResolvedValue(null as never);
    usage.retrievalRefusal.mockResolvedValue("unavailable");
    await run();
    expect(model.generate).not.toHaveBeenCalled();
    expect(crawl()).toMatchObject({ status: "failed", failureReason: "aiUnavailable", topics: [] });
  });

  it("bills a workspace-setup import to the platform under the per-workspace cap, never to the requester", async () => {
    const { run, usage, settled } = harness("extend", "workspaceSetup");
    model.generate
      .mockResolvedValueOnce(plan([{ title: "Scheduling", role: "offering", sources: ["s2"] }]))
      .mockResolvedValue(draft());
    const owner = createMockUser({ companyId: "company-setup" });
    await runWithTenant(owner, run);
    expect(usage.prepareRetrieval).not.toHaveBeenCalled();
    expect(usage.reserveRetrieval).not.toHaveBeenCalled();
    expect(usage.reserveWorkspacePlatform).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "company-setup",
        purpose: WORKSPACE_SETUP_PLATFORM_PURPOSE,
        capMicrocents: WORKSPACE_SETUP_SPEND_CAP_MICROCENTS,
      }),
    );
    expect(usage.settlePlatformRetrieval).toHaveBeenCalledTimes(usage.reserveWorkspacePlatform.mock.calls.length);
    expect(settled.every((charge) => charge !== null)).toBe(true);
  });

  it("skips a workspace-setup page as credits once the workspace cap is reached", async () => {
    const { run, usage, crawl } = harness("extend", "workspaceSetup");
    model.generate.mockResolvedValueOnce(plan([{ title: "Scheduling", role: "offering", sources: ["s2"] }]));
    usage.reserveWorkspacePlatform
      .mockResolvedValueOnce({ status: "reserved", id: "plan" })
      .mockResolvedValue({ status: "cap" });
    await runWithTenant(createMockUser({ companyId: "company-setup" }), run);
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

  it("waits for the workspace setup to confirm its plan before planning pages", async () => {
    const { service, briefs, crawl } = harness("initial", "workspaceSetup", { status: "wait" });
    expect(await service.plan("crawl-1")).toBe("wait");
    expect(briefs.brief).toHaveBeenCalledWith(expect.objectContaining({ id: "crawl-1" }), false);
    expect(model.generate).not.toHaveBeenCalled();
    expect(crawl().topics).toBeNull();
  });

  it("writes no synthesized pages once the workspace setup no longer wants them", async () => {
    const { run, crawl } = harness("initial", "workspaceSetup", { status: "cancelled" });
    await run();
    expect(model.generate).not.toHaveBeenCalled();
    expect(crawl()).toMatchObject({ status: "failed", failureReason: "cancelled", topics: [] });
  });
});

describe("website Knowledge Base synthesis from a workspace setup plan", () => {
  const brief: WikiSynthesisBriefState = {
    status: "ready",
    brief: {
      topics: [
        { key: "about", role: "company_overview", title: "About Example", outline: ["What we do", "Who we serve"] },
        { key: "pricing", role: "offering", title: "Plans and prices", outline: [] },
        { key: "toneOfVoice", role: "voice_and_tone", title: "Voice and tone", outline: [] },
        { key: "competitor1", role: "competitor", title: "Compared with Rival", outline: [], competitor: "Rival" },
      ],
      extraRoles: ["offering"],
      addressForm: "formal",
    },
  };

  it("plans the chosen pages with their outlines beside the offerings the website shows", async () => {
    const { service, crawl } = harness("initial", "workspaceSetup", brief);
    model.generate.mockResolvedValueOnce(
      plan([
        { key: "about", title: "Renamed", role: "offering", sources: ["s1"] },
        { key: "", title: "Scheduling", role: "offering", sources: ["s2"] },
        { key: "", title: "Field FAQ", role: "faq", sources: ["s2"] },
        { key: "", title: "Second overview", role: "company_overview", sources: ["s1"] },
        { key: "", title: "Guide", role: "operating_guide", sources: ["s1"] },
      ] as never),
    );
    expect(await runWithTenant(createMockUser({ companyId: "company-setup" }), () => service.plan("crawl-1"))).toBe(6);
    const call = model.generate.mock.calls[0][0] as { system: string; prompt: string };
    expect(call.system).toContain("required pages");
    expect(call.prompt).toContain('"outline":["What we do","Who we serve"]');
    expect(call.prompt).toContain('Additional roles: ["offering"]');
    expect(crawl().topics?.map(({ title, role, setupKey }) => [title, role, setupKey])).toEqual([
      ["About Example", "company_overview", "about"],
      ["Voice and tone", "voice_and_tone", "toneOfVoice"],
      ["Plans and prices", "offering", "pricing"],
      ["Scheduling", "offering", undefined],
      ["Compared with Rival", "competitor", "competitor1"],
      ["Guide", "operating_guide", undefined],
    ]);
    const topics = crawl().topics ?? [];
    expect(topics[0]).toMatchObject({ sourceIds: [id(1)], outline: ["What we do", "Who we serve"] });
    expect(topics[2].sourceIds).toEqual([id(1), id(2)]);
    expect(topics[1]).toMatchObject({ addressForm: "formal" });
    expect(topics[4]).toMatchObject({ competitor: "Rival" });
    expect(topics[5]).toMatchObject({ addressForm: "formal" });
  });

  it("writes the owner's form of address and leaves competitor claims for the team to complete", async () => {
    const { run, created } = harness("initial", "workspaceSetup", {
      status: "ready",
      brief: {
        topics: [
          { key: "toneOfVoice", role: "voice_and_tone", title: "Voice and tone", outline: [] },
          {
            key: "competitor1",
            role: "competitor",
            title: "Compared with Rival",
            outline: ["Pricing"],
            competitor: "Rival",
          },
        ],
        extraRoles: [],
        addressForm: "informal",
      },
    });
    model.generate
      .mockResolvedValueOnce(
        plan([
          { key: "toneOfVoice", title: "x", role: "voice_and_tone", sources: ["s1"] },
          { key: "competitor1", title: "x", role: "competitor", sources: ["s2"] },
        ] as never),
      )
      .mockResolvedValueOnce(citing("s1", SOURCES[0].text, "Example GmbH writes about scheduling software."))
      .mockResolvedValue({ output: null, charge: CHARGE });
    await runWithTenant(createMockUser({ companyId: "company-setup" }), run);
    const competitorPrompt = model.generate.mock.calls
      .map(([args]) => (args as { prompt: string }).prompt)
      .find((prompt) => prompt.includes("Page title: Compared with Rival"));
    expect(competitorPrompt).toContain('Competitor: "Rival"');
    expect(competitorPrompt).toContain('Planned sections: ["Pricing"]');
    expect(created.map(({ title }) => title)).toEqual(["Voice and tone", "Compared with Rival", "Operating Guide"]);
    expect(created[0].markdown).toMatch(/^## Form of address\n\nAddress customers informally/);
    expect(created[0].markdown).toContain("## How it works");
    expect(created[1].markdown).toContain("## To complete by your team");
    expect(created[1].markdown).toContain("- Where Rival is the better fit");
    expect(created[1].markdown).not.toContain("## Sources");
    expect(created[2]).toMatchObject({ kind: "guide" });
    expect(created[2].markdown).toContain("Address customers informally");
  });
});
