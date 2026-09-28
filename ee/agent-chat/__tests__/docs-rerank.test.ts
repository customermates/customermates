import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import {
  createMockDiModule,
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const envState = vi.hoisted(() => ({
  APP_MODE: "cloud" as "cloud" | "demo" | "self-hosted",
  AI_GATEWAY_API_KEY: "test-gateway-key" as string | undefined,
}));

vi.mock("@/env", () => ({
  env: new Proxy(MOCK_ENV_MODULE.env as Record<string, unknown>, {
    get: (target, key: string) => (key in envState ? envState[key as keyof typeof envState] : target[key]),
  }),
}));
vi.mock("@/core/di", () => createMockDiModule(() => createMockUser()));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), setTag: vi.fn(), setUser: vi.fn() }));

import {
  DOCS_RERANK_CANDIDATES,
  docsPageRankCandidates,
  docsRankCandidates,
  docsPageResult,
  getDocsPageRaw,
  keywordDocsSearch,
  relevantDocsExcerpt,
  searchDocsRaw,
} from "@/features/mcp-tools/docs.mcp-tools";
import { agentPageContextPrefix } from "../agent-page-context";

import { getAgentAiTools, type AgentToolDeps } from "../agent-tools";
import { collectClassifierCharges } from "../classifier/metered";
import { JEV_DEADLINE_MS, JEV_EVALUATE_URL } from "../classifier/jev-runner";
import {
  DOCS_RERANK_USER_MESSAGE_CHARS,
  docsRankOrder,
  docsRankSpec,
  docsRankState,
  docsRankUserMessage,
  docsRerankChoice,
  docsRerankPlainText,
  hostedDocsRanking,
  hostedSectionRankers,
} from "../docs-rerank";
import { currentSectionRanker } from "@/core/retrieval/retrieval-context";
import { searchDocsTool } from "@/features/mcp-tools/docs.mcp-tools";
import { manageWikiPagesTool } from "@/features/mcp-tools/wiki.mcp-tools";

const QUERY = "which header does the REST API expect for auth";
const INPUT = { query: QUERY, locale: "en", source: "docs" };

function deps(latestUserMessage: string | null = null): AgentToolDeps {
  return {
    latestUserMessage,
    runUiCommand: vi.fn(),
    requestApproval: vi.fn(),
    resolveApprovalContext: vi.fn().mockImplementation((_toolName, input) => Promise.resolve({ ok: true, input })),
    createSupportTicket: vi.fn(),
    runExactlyOnce: (_toolCallId, _toolName, run) => run(),
    runInCallerContext: (run) => run(),
    resultMaxChars: 6000,
  };
}

function runHostedDocsTool(name: "search_docs" | "get_docs_page", input: unknown, latestUserMessage?: string) {
  const tool = getAgentAiTools(deps(latestUserMessage ?? null))[name] as unknown as {
    execute: (
      value: unknown,
      options: { toolCallId: string; messages: [] },
    ) => Promise<{ ok: boolean; result: string }>;
  };
  return collectClassifierCharges(() => tool.execute(input, { toolCallId: "call-1", messages: [] }));
}

function runSearchDocs(input: unknown, latestUserMessage?: string) {
  return runHostedDocsTool("search_docs", input, latestUserMessage);
}

function jevChoosing(pick: (keys: string[]) => string, probabilities?: (keys: string[]) => Record<string, number>) {
  return vi.fn((_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { questions: { best: { criteria: Record<string, string> } } };
    const keys = Object.keys(body.questions.best.criteria);
    const choice = pick(keys);
    return Promise.resolve(
      new Response(
        JSON.stringify({
          answers: {
            best: {
              type: "choice",
              choice,
              confidence: 0.8,
              ...(probabilities ? { probabilities: probabilities(keys) } : {}),
            },
          },
          providerMetadata: {
            gateway: {
              routing: {
                finalProvider: "typesafe-ai",
                modelAttempts: [
                  {
                    success: true,
                    providerAttempts: [{ provider: "typesafe-ai", credentialType: "system", success: true }],
                  },
                ],
              },
              cost: "0.00002",
              inferenceCost: "0.00002",
              surchargeCost: "0",
              gatewayCost: "0.00002",
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
  });
}

beforeEach(() => {
  envState.APP_MODE = "cloud";
  envState.AI_GATEWAY_API_KEY = "test-gateway-key";
  vi.stubEnv("LOCAL_AGENT_BENCHMARK", "true");
  vi.stubEnv("AGENT_BENCHMARK_RETRIEVAL", "legacy");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("docs re-rank classifier spec", () => {
  it("strips link lines, markdown marks and link targets from option text", () => {
    expect(docsRerankPlainText("**Link:** /x\nUse `x-api-key` in [the header](/docs/api-keys) | done")).toBe(
      "Use x-api-key in the header done",
    );
  });

  it("reads only a candidate key as the choice", () => {
    const answer = (choice: string) => ({
      model: "jev" as const,
      answers: { best: { type: "choice" as const, choice, probabilities: null, confidence: null } },
      costMicrocents: 1,
      latencyMs: 1,
    });

    expect(docsRerankChoice(answer("s42"))).toBe(42);
    expect(docsRerankChoice(answer("best"))).toBeNull();
    expect(docsRerankChoice(null)).toBeNull();
  });

  it("gives the classifier its 800 ms deadline on the docs path", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    vi.stubGlobal(
      "fetch",
      jevChoosing((keys) => keys[0]),
    );

    await runSearchDocs(INPUT);

    expect(JEV_DEADLINE_MS).toBe(800);
    expect(timeout).toHaveBeenCalledWith(JEV_DEADLINE_MS);
  });
});

describe("hosted docs re-rank switch", () => {
  it("ranks with Jev on every hosted instance and never self-hosted", () => {
    expect(hostedDocsRanking()).toBeTypeOf("function");
    envState.APP_MODE = "demo";
    expect(hostedDocsRanking()).toBeTypeOf("function");
    envState.APP_MODE = "self-hosted";
    expect(hostedDocsRanking()).toBeUndefined();
  });

  it("leaves search_docs untouched and calls no classifier self-hosted", async () => {
    envState.APP_MODE = "self-hosted";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { value, charges } = await runSearchDocs(INPUT);

    expect(value.result).toBe(keywordDocsSearch(INPUT as never).text);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(charges).toEqual([]);
  });

  it("never re-ranks for external MCP clients", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(keywordDocsSearch(INPUT as never).text).not.toContain("\nexcerpt=\n");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

const USER_MESSAGE = "Mit welchem Header authentifiziere ich mich bei der REST API?";

describe("docs re-rank candidates and spec", () => {
  it("offers the keyword top 20 with excerpts plus every other section title of the top 5 pages", () => {
    const candidates = docsRankCandidates(QUERY, "en");
    const lexical = candidates.filter((candidate) => !candidate.titleOnly);
    const topPages = new Set(searchDocsRaw(QUERY, "en", "docs").results.map((hit) => hit.slug));
    const titles = candidates.filter((candidate) => candidate.titleOnly);

    expect(lexical).toHaveLength(DOCS_RERANK_CANDIDATES);
    expect(candidates.slice(0, lexical.length).map(({ id, titleOnly }) => ({ id, titleOnly }))).toEqual(
      lexical.map(({ id }) => ({ id, titleOnly: false })),
    );
    expect(titles.length).toBeGreaterThan(0);
    expect(titles.every(({ section }) => topPages.has(section.slug))).toBe(true);
    expect(new Set(candidates.map(({ id }) => id)).size).toBe(candidates.length);
    for (const slug of topPages) {
      const onPage = docsPageRankCandidates({ source: "docs", locale: "en", slug }).map(({ id }) => id);
      expect(onPage.every((id) => candidates.some((candidate) => candidate.id === id))).toBe(true);
    }
  });

  it("shows title-only candidates without an excerpt and asks from the user's message and the agent's query", () => {
    const candidates = docsRankCandidates(QUERY, "en");
    const spec = docsRankSpec(candidates);
    const [question] = spec.questions;
    const title = candidates.find((candidate) => candidate.titleOnly) as (typeof candidates)[number];
    const excerpted = candidates[0];

    expect(spec.id).toBe("docs-rank");
    expect(question.instruction).toContain("`latest_user_message`");
    expect(question.instruction).toContain("`agent_query`");
    expect(question.options[`s${title.id}`]).toBe(
      `${title.section.pageTitle} > ${title.section.headingPath.join(" > ")}`,
    );
    expect(question.options[`s${excerpted.id}`]).toContain(": ");
    expect(docsRankState(QUERY, USER_MESSAGE)).toEqual({ latest_user_message: USER_MESSAGE, agent_query: QUERY });
    expect(docsRankState(QUERY, null)).toEqual({ agent_query: QUERY });
  });

  it("strips the page and selected context from the user's message and caps it", () => {
    const long = `${agentPageContextPrefix("/en/deals")}${"x".repeat(DOCS_RERANK_USER_MESSAGE_CHARS + 50)}`;

    expect(docsRankUserMessage(`${agentPageContextPrefix("/en/deals")}${USER_MESSAGE}`)).toBe(USER_MESSAGE);
    expect(docsRankUserMessage(long)).toBe("x".repeat(DOCS_RERANK_USER_MESSAGE_CHARS));
    expect(docsRankUserMessage(agentPageContextPrefix("/en/deals"))).toBeNull();
    expect(docsRankUserMessage(null)).toBeNull();
  });

  it("returns the chosen section first, then the most probable ones, at most three", () => {
    const candidates = [{ id: 4 }, { id: 7 }, { id: 9 }, { id: 12 }];
    const result = (choice: string, probabilities: Record<string, number> | null) => ({
      model: "jev" as const,
      answers: { best: { type: "choice" as const, choice, probabilities, confidence: null } },
      costMicrocents: 1,
      latencyMs: 1,
    });

    expect(docsRankOrder(result("s9", { s4: 0.1, s7: 0.2, s9: 0.3, s12: 0.25 }), candidates)).toEqual([9, 12, 7]);
    expect(docsRankOrder(result("s12", null), candidates)).toEqual([12, 4, 7]);
    expect(docsRankOrder(result("s99", null), candidates)).toBeNull();
    expect(docsRankOrder(null, candidates)).toBeNull();
  });
});

describe("hosted docs re-rank", () => {
  it("returns the three highest-ranked sections, chosen first, and sends the user's message", async () => {
    const candidates = docsRankCandidates(QUERY, "en");
    const title = candidates.findLast((candidate) => candidate.titleOnly) as (typeof candidates)[number];
    const [second, third] = candidates;
    const fetchMock = jevChoosing(
      () => `s${title.id}`,
      (keys) =>
        Object.fromEntries(
          keys.map((key) => [key, key === `s${second.id}` ? 0.3 : key === `s${third.id}` ? 0.2 : 0.01]),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { value, charges } = await runSearchDocs(INPUT, `${agentPageContextPrefix("/en/deals")}${USER_MESSAGE}`);
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as { state: unknown };
    const excerpt = value.result.split("\nexcerpt=\n")[1];
    const headings = [title, second, third].map(({ section }) => `## ${section.headingPath.join(" > ")}\n`);

    expect(fetchMock).toHaveBeenCalledWith(JEV_EVALUATE_URL, expect.objectContaining({ signal: expect.anything() }));
    expect(sent.state).toEqual({ latest_user_message: USER_MESSAGE, agent_query: QUERY });
    expect(value.result.split("\n")[1]).toBe(`docs:${title.section.slug}#${title.section.anchor}`);
    expect(excerpt.startsWith(headings[0])).toBe(true);
    expect(headings.map((heading) => excerpt.indexOf(heading))).toEqual(
      [...headings.map((heading) => excerpt.indexOf(heading))].sort((a, b) => a - b),
    );
    expect(headings.every((heading) => excerpt.includes(heading))).toBe(true);
    expect(charges).toEqual([
      { use: "docs_rerank", model: "jev", costMicrocents: 2000, measured: true, answered: true },
    ]);
  });

  it("chooses the section get_docs_page returns for a query, and leaves a page without a query alone", async () => {
    const slug = searchDocsRaw(QUERY, "en", "docs").results[0].slug;
    const onPage = docsPageRankCandidates({ source: "docs", locale: "en", slug });
    const chosen = onPage.at(-1) as (typeof onPage)[number];
    const fetchMock = jevChoosing(() => `s${chosen.id}`);
    vi.stubGlobal("fetch", fetchMock);
    const input = { slug, query: QUERY, locale: "en", source: "docs" };

    const ranked = await runHostedDocsTool("get_docs_page", input, USER_MESSAGE);
    const whole = await runHostedDocsTool("get_docs_page", { slug, locale: "en", source: "docs" }, USER_MESSAGE);

    expect(onPage.length).toBeGreaterThan(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(ranked.value.result).not.toBe((docsPageResult(input as never) as { text: string }).text);
    expect(ranked.value.result.startsWith(`## ${chosen.section.headingPath.at(-1)}\n`)).toBe(true);
    expect(ranked.value.result.startsWith(relevantDocsExcerpt({ source: "docs", locale: "en", slug }, QUERY))).toBe(
      false,
    );
    expect(ranked.charges).toHaveLength(1);
    expect(whole.value.result.startsWith(`# ${getDocsPageRaw(slug, "en", "docs")?.title}\n`)).toBe(true);
    expect(whole.charges).toEqual([]);
  });

  it("falls back to the keyword outputs when the classifier fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("{}", { status: 504 }))),
    );
    const slug = searchDocsRaw(QUERY, "en", "docs").results[0].slug;
    const pageInput = { slug, query: QUERY, locale: "en", source: "docs" };

    const search = await runSearchDocs(INPUT, USER_MESSAGE);
    const page = await runHostedDocsTool("get_docs_page", pageInput, USER_MESSAGE);

    expect(search.value.result).toBe(keywordDocsSearch(INPUT as never).text);
    expect(page.value.result).toBe((docsPageResult(pageInput as never) as { text: string }).text);
    expect([...search.charges, ...page.charges]).toEqual([
      expect.objectContaining({ use: "docs_rerank", model: "jev", measured: false, answered: false }),
      expect.objectContaining({ use: "docs_rerank", model: "jev", measured: false, answered: false }),
    ]);
  });
});

describe("section re-rank for documentation and the Workspace Wiki", () => {
  const candidates = [
    {
      id: 0,
      section: { pageTitle: "Refund policy", headingPath: ["Approval"], text: "The finance lead approves." },
      titleOnly: false,
    },
    {
      id: 1,
      section: { pageTitle: "Travel", headingPath: ["Mileage"], text: "0.30 EUR per kilometre." },
      titleOnly: false,
    },
  ];

  it("asks Jev about Wiki sections under its own use and spec", async () => {
    const fetchMock = jevChoosing(() => "s1");
    vi.stubGlobal("fetch", fetchMock);
    const rankers = hostedSectionRankers(USER_MESSAGE);
    if (!rankers) throw new Error("expected hosted rankers");

    const { value, charges } = await collectClassifierCharges(async () => rankers("wiki")?.("mileage", candidates));
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as {
      questions: { best: { instructions: string } };
    };

    expect(value).toEqual([1, 0]);
    expect(sent.questions.best.instructions).toContain("searched the Workspace Wiki");
    expect(docsRankSpec(candidates, "wiki").id).toBe("wiki-rank");
    expect(docsRankSpec(candidates).id).toBe("docs-rank");
    expect(charges).toEqual([expect.objectContaining({ use: "wiki_rerank", model: "jev", answered: true })]);
  });

  it("offers no rankers self-hosted", () => {
    envState.APP_MODE = "self-hosted";
    expect(hostedSectionRankers()).toBeUndefined();
  });

  it("hands the hosted docs and Wiki tools their rankers for the call and no one else", async () => {
    vi.unstubAllEnvs();
    const seen: Record<string, boolean> = {};
    vi.spyOn(searchDocsTool, "execute").mockImplementation(() => {
      seen.docs = currentSectionRanker("docs") !== undefined;
      return Promise.resolve({ text: "matches: none", structuredContent: { results: [], total: 0 } });
    });
    vi.spyOn(manageWikiPagesTool, "execute").mockImplementation(() => {
      seen.wiki = currentSectionRanker("wiki") !== undefined;
      return Promise.resolve("ok");
    });
    const tools = getAgentAiTools(deps(USER_MESSAGE)) as unknown as Record<
      string,
      { execute: (value: unknown, options: { toolCallId: string; messages: [] }) => Promise<unknown> }
    >;

    await tools.search_docs.execute(INPUT, { toolCallId: "call-docs", messages: [] });
    await tools.manage_wiki_pages.execute(
      { action: "search", query: "refunds" },
      { toolCallId: "call-wiki", messages: [] },
    );

    expect(seen).toEqual({ docs: true, wiki: true });
    expect(currentSectionRanker("docs")).toBeUndefined();
  });
});
