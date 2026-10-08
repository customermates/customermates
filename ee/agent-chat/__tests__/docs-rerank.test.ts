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
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  setTag: vi.fn(),
  setUser: vi.fn(),
}));

import type { RankableSection, SectionRanker } from "@/core/retrieval/retrieval-context";

import { agentPageContextPrefix } from "../agent-page-context";

import { getAgentAiTools, type AgentToolDeps } from "../agent-tools";
import { collectClassifierCharges } from "../classifier/metered";
import { JEV_DEADLINE_MS, JEV_EVALUATE_URL } from "../classifier/jev-runner";
import {
  DOCS_RERANK_NONE,
  DOCS_RERANK_USER_MESSAGE_CHARS,
  docsRankOrder,
  docsRankSpec,
  docsRankState,
  docsRankUserMessage,
  docsRerankChoice,
  docsRerankPlainText,
  hostedSectionRankers,
} from "../docs-rerank";
import { currentSectionRanker } from "@/core/retrieval/retrieval-context";
import { docsCorpusSections } from "@/features/mcp-tools/docs-manifest";
import rawDocsManifest from "@/generated/raw-docs-manifest.json";
import { splitSections } from "@/features/mcp-tools/docs-sections";
import { getDocsPageTool, searchDocsTool } from "@/features/mcp-tools/docs.mcp-tools";
import { manageWikiPagesTool } from "@/features/mcp-tools/wiki.mcp-tools";

const QUERY = "which header does the REST API expect for auth";
const INPUT = { query: QUERY, locale: "en", source: "docs" };

function optionEvidence(option: string): string {
  const evidence = option.match(/^Content: ([\s\S]*?)\nPage context:/mu)?.[1];
  if (evidence === undefined) throw new Error("Expected section content before page context");
  return evidence;
}

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

const RANKABLE: RankableSection[] = [
  {
    id: 0,
    section: {
      pageTitle: "API Keys",
      headingPath: ["Authentication"],
      text: "Send the key in the `x-api-key` header.",
    },
  },
  {
    id: 1,
    section: {
      pageTitle: "API Keys",
      headingPath: ["Do keys expire?"],
      text: "Keys expire after 365 days.",
    },
  },
  {
    id: 2,
    section: {
      pageTitle: "Webhooks",
      headingPath: ["Signatures"],
      text: "Verify the signature header.",
    },
  },
  {
    id: 3,
    section: { pageTitle: "API Keys", headingPath: ["Scopes"], text: "" },
  },
];

function docsRanker(latestUserMessage?: string) {
  const ranker = hostedSectionRankers(latestUserMessage)?.("docs");
  if (!ranker) throw new Error("expected a hosted docs ranker");
  return ranker;
}

function jevChoosing(pick: (keys: string[]) => string, probabilities?: (keys: string[]) => Record<string, number>) {
  return vi.fn((_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as {
      questions: { best: { criteria: Record<string, string> } };
    };
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
                    providerAttempts: [
                      {
                        provider: "typesafe-ai",
                        credentialType: "system",
                        success: true,
                      },
                    ],
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
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("docs re-rank classifier spec", () => {
  it("strips markdown marks and link targets from option text", () => {
    expect(
      docsRerankPlainText(
        "Use `x-api-key` in [the header](/docs/api-keys) of [API keys](http://localhost:4000/settings/api-keys) | done",
      ),
    ).toBe("Use x-api-key in the header of API keys done");
  });

  it("reads only a candidate key as the choice", () => {
    const answer = (choice: string) => ({
      model: "jev" as const,
      answers: {
        best: {
          type: "choice" as const,
          choice,
          probabilities: null,
          confidence: null,
        },
      },
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

    await collectClassifierCharges(() => docsRanker()(QUERY, RANKABLE));

    expect(JEV_DEADLINE_MS).toBe(800);
    expect(timeout).toHaveBeenCalledWith(JEV_DEADLINE_MS);
  });
});

describe("hosted docs re-rank switch", () => {
  it("ranks with Jev on every hosted instance and never self-hosted", () => {
    expect(hostedSectionRankers()?.("docs")).toBeTypeOf("function");
    envState.APP_MODE = "demo";
    expect(hostedSectionRankers()?.("docs")).toBeTypeOf("function");
    envState.APP_MODE = "self-hosted";
    expect(hostedSectionRankers()).toBeUndefined();
  });
});

const USER_MESSAGE = "Mit welchem Header authentifiziere ich mich bei der REST API?";

describe("docs re-rank candidates and spec", () => {
  it("shows empty sections without an excerpt and asks from the user's message and the agent's query", () => {
    const spec = docsRankSpec(RANKABLE);
    const [question] = spec.questions;
    const title = RANKABLE[3];
    const excerpted = RANKABLE[0];

    expect(spec.id).toBe("docs-rank");
    expect(question.instruction).toContain("`latest_user_message`");
    expect(question.instruction).toContain("`agent_query`");
    expect(question.options[`s${title.id}`]).toBe(
      `Section: ${title.section.headingPath.at(-1)}\nPage context: ${title.section.pageTitle}`,
    );
    expect(question.options[`s${excerpted.id}`]).toBe(
      "Section: Authentication\nContent: Send the key in the x-api-key header.\nPage context: API Keys",
    );
    expect(docsRankState(QUERY, USER_MESSAGE)).toEqual({
      latest_user_message: USER_MESSAGE,
      agent_query: QUERY,
    });
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
      answers: {
        best: {
          type: "choice" as const,
          choice,
          probabilities,
          confidence: null,
        },
      },
      costMicrocents: 1,
      latencyMs: 1,
    });

    expect(docsRankOrder(result("s9", { s4: 0.1, s7: 0.2, s9: 0.3, s12: 0.25 }), candidates)).toEqual({
      order: [9, 12, 7],
      abstained: false,
    });
    expect(docsRankOrder(result("s12", null), candidates)).toEqual({
      order: [12, 4, 7],
      abstained: false,
    });
    expect(docsRankOrder(result("s99", null), candidates)).toBeNull();
    expect(docsRankOrder(null, candidates)).toBeNull();
  });

  it("offers a none option and reports an abstention with the most probable sections still ordered", () => {
    const candidates = [{ id: 4 }, { id: 7 }, { id: 9 }];
    const result = (probabilities: Record<string, number> | null) => ({
      model: "jev" as const,
      answers: {
        best: {
          type: "choice" as const,
          choice: DOCS_RERANK_NONE,
          probabilities,
          confidence: null,
        },
      },
      costMicrocents: 1,
      latencyMs: 1,
    });
    const [question] = docsRankSpec(RANKABLE).questions;

    expect(Object.keys(question.options).at(-1)).toBe(DOCS_RERANK_NONE);
    expect(question.instruction).toContain("choose none only if no section answers it at all");
    expect(docsRankOrder(result({ s4: 0.05, s7: 0.15, s9: 0.1, none: 0.7 }), candidates)).toEqual({
      order: [7, 9, 4],
      abstained: true,
    });
    expect(docsRankOrder(result(null), candidates)).toEqual({
      order: [4, 7, 9],
      abstained: true,
    });
  });
});

describe("hosted docs re-rank", () => {
  it("returns the three highest-ranked sections, chosen first, and sends the user's message", async () => {
    const fetchMock = jevChoosing(
      () => "s3",
      (keys) => Object.fromEntries(keys.map((key) => [key, key === "s1" ? 0.3 : key === "s2" ? 0.2 : 0.01])),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { value, charges } = await collectClassifierCharges(() =>
      docsRanker(`${agentPageContextPrefix("/en/deals")}${USER_MESSAGE}`)(QUERY, RANKABLE),
    );
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as {
      state: unknown;
    };

    expect(fetchMock).toHaveBeenCalledWith(JEV_EVALUATE_URL, expect.objectContaining({ signal: expect.anything() }));
    expect(sent.state).toEqual({
      latest_user_message: USER_MESSAGE,
      agent_query: QUERY,
    });
    expect(value).toEqual({ order: [3, 1, 2], abstained: false });
    expect(charges).toEqual([
      {
        use: "docs_rerank",
        model: "jev",
        costMicrocents: 2000,
        measured: true,
        answered: true,
      },
    ]);
  });

  it("returns no order when the classifier fails, so retrieval keeps its fused order", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("{}", { status: 504 }))),
    );

    const { value, charges } = await collectClassifierCharges(() => docsRanker(USER_MESSAGE)(QUERY, RANKABLE));

    expect(value).toBeNull();
    expect(charges).toEqual([
      expect.objectContaining({
        use: "docs_rerank",
        model: "jev",
        measured: false,
        answered: false,
      }),
    ]);
  });
});

describe("section re-rank for documentation and the Workspace Wiki", () => {
  const candidates = [
    {
      id: 0,
      section: {
        pageTitle: "Refund policy",
        headingPath: ["Approval"],
        text: "The finance lead approves.",
      },
    },
    {
      id: 1,
      section: {
        pageTitle: "Travel",
        headingPath: ["Mileage"],
        text: "0.30 EUR per kilometre.",
      },
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

    expect(value).toEqual({ order: [1, 0], abstained: false });
    expect(sent.questions.best.instructions).toContain("searched the Knowledge Base");
    expect(docsRankSpec(candidates, "wiki").id).toBe("wiki-rank");
    expect(docsRankSpec(candidates).id).toBe("docs-rank");
    expect(charges).toEqual([
      expect.objectContaining({
        use: "wiki_rerank",
        model: "jev",
        answered: true,
      }),
    ]);
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
      return Promise.resolve({
        text: "matches: none",
        structuredContent: { results: [], total: 0 },
      });
    });
    vi.spyOn(manageWikiPagesTool, "execute").mockImplementation(() => {
      seen.wiki = currentSectionRanker("wiki") !== undefined;
      return Promise.resolve("ok");
    });
    const tools = getAgentAiTools(deps(USER_MESSAGE)) as unknown as Record<
      string,
      {
        execute: (value: unknown, options: { toolCallId: string; messages: [] }) => Promise<unknown>;
      }
    >;

    await tools.search_docs.execute(INPUT, {
      toolCallId: "call-docs",
      messages: [],
    });
    await tools.manage_wiki_pages.execute(
      { action: "search", query: "refunds" },
      { toolCallId: "call-wiki", messages: [] },
    );

    expect(seen).toEqual({ docs: true, wiki: true });
    expect(currentSectionRanker("docs")).toBeUndefined();
  });
});

describe("query-focused section-ranking evidence", () => {
  it("uses actual section labels and locale without expanding catalog evidence", () => {
    const page = rawDocsManifest.docs.en.mcp;
    const section = splitSections({
      slug: "mcp",
      source: "docs",
      pageTitle: page.title,
      markdown: page.content,
    }).find(({ anchor }) => anchor === "tool-catalog");
    expect(section).toBeDefined();
    if (!section) throw new Error("Expected public documentation section");
    const candidates = Array.from({ length: 120 }, (_, id) => ({
      id,
      section,
      locale: "en" as const,
    }));
    const [question] = docsRankSpec(candidates, "docs", "What can the MCP server do?").questions;
    expect(question.options.s0).toContain(
      "They cover configurable records, record-model management, workspace, saved views, the Knowledge Base, messaging",
    );
    expect(question.options.s0).toContain("widgets, routines, webhooks, admin and support");
    expect(question.options.s0).toContain("MCP tools, all enabled by default");
    expect(optionEvidence(question.options.s0).length).toBeLessThanOrEqual(478);
  });

  it("includes a matching detail after a long introduction and keeps its inline app link text", () => {
    const [question] = docsRankSpec(
      [
        {
          id: 0,
          section: {
            pageTitle: "Connections",
            headingPath: ["Mailbox status"],
            text:
              "Background. ".repeat(80) +
              "\nPermission issue means the mailbox needs to be [reactivated](http://localhost:4000/settings/channels).",
          },
        },
      ],
      "docs",
      "mailbox permission issue",
    ).questions;
    expect(question.options.s0).toContain("Permission issue means the mailbox needs to be reactivated.");
    expect(question.options.s0).not.toContain("http://localhost:4000");
    expect(optionEvidence(question.options.s0).length).toBeLessThanOrEqual(800);
  });

  it("bounds combined evidence while preserving every candidate's own matching detail", () => {
    const candidates = Array.from({ length: 120 }, (_, id) => ({
      id,
      section: {
        pageTitle: "Connections",
        headingPath: ["Mailbox status"],
        text:
          "Background. ".repeat(80) +
          "\n[Reactivation](http://localhost:4000/settings/channels) restores access.",
      },
    }));
    const [question] = docsRankSpec(candidates, "docs", "reactivation access").questions;
    expect(Object.keys(question.options)).toHaveLength(121);
    let characters = 0;
    for (const { id } of candidates) {
      const option = question.options[`s${id}`];
      const excerpt = optionEvidence(option);
      expect(excerpt).toContain("Reactivation restores access.");
      expect(excerpt).not.toContain("http://localhost:4000");
      expect(excerpt.length).toBeLessThanOrEqual(id < 20 ? 400 : 80);
      characters += excerpt.length;
    }
    expect(characters).toBeLessThanOrEqual(16_000);
  });
  it("gives fused high-rank sections enough evidence to retain complete operation details", () => {
    const instruction =
      "Link the record to its related service, then enter a quantity for that relationship and save both changes in the record drawer.";
    const source = instruction.replace(
      "related service",
      "related [service](http://localhost:4000/open/records/service)",
    );
    const candidates = Array.from({ length: 120 }, (_, id) => ({
      id,
      section: {
        pageTitle: "Records",
        headingPath: ["Relationships"],
        text: `Background. ${"filler ".repeat(80)}\n${source}`,
      },
    }));
    const [question] = docsRankSpec(candidates, "docs", "service quantity relationship").questions;
    expect(question.options.s2).toContain(instruction);
    expect(question.options.s2).not.toContain("http://localhost:4000");
    expect(optionEvidence(question.options.s119).length).toBeLessThanOrEqual(80);
  });
  it("does not spend a small sibling excerpt on its already supplied section heading", () => {
    const heading =
      "A deliberately long section heading that describes the user's available record permissions in detail";
    const evidence = "Assigned read access limits contacts to their owners and assignees.";
    const candidates = Array.from({ length: 120 }, (_, id) => ({
      id,
      section: {
        pageTitle: "Permissions",
        headingPath: [heading],
        text: `## ${heading}\n\n${evidence}`,
      },
    }));
    const [question] = docsRankSpec(candidates, "docs", "own assigned contacts").questions;
    expect(question.options.s119).toContain(evidence);
    expect(question.options.s119.split(heading)).toHaveLength(2);
    expect(optionEvidence(question.options.s119).length).toBeLessThanOrEqual(80);
  });
});

describe("real small sibling evidence", () => {
  it("retains a genuine child heading in a rolled-up parent section", () => {
    const spec = docsRankSpec(
      [
        {
          id: 0,
          section: {
            pageTitle: "Policies",
            headingPath: ["Common questions"],
            text: "### Who approves an exception?\nNot published.",
          },
        },
      ],
      "wiki",
      "exception approvals",
    );
    expect(spec.questions[0].options.s0).toContain("Who approves an exception?");
    expect(spec.questions[0].options.s0).toContain("Not published.");
  });
  it("offers body evidence for a role-editor sibling whose real introduction exceeds its available body budget", () => {
    const role = docsCorpusSections("docs", "en").find(
      (section) => section.slug === "app-company" && section.anchor === "how-does-the-role-editor-work",
    );
    if (!role) throw new Error("Missing role editor fixture.");
    expect(role.text).not.toMatch(/^#{1,6} /u);
    const candidates = Array.from({ length: 120 }, (_, id) => ({
      id,
      section:
        id === 119
          ? role
          : {
              pageTitle: "Unrelated",
              headingPath: ["History"],
              text: "Old history.",
            },
    }));
    const option = docsRankSpec(candidates, "docs", "Can users only see their own contacts?").questions[0].options.s119;
    const evidence = optionEvidence(option);
    expect(evidence).toMatch(/assigned|member|records/iu);
    expect(evidence).not.toContain("http://localhost:4000");
    expect(evidence.length).toBeLessThanOrEqual(80);
  });
});

describe("initial channel errors and existing channel recovery evidence", () => {
  it.each([
    {
      locale: "en" as const,
      query: "Error connecting my Gmail channel",
      setupAction: "Click Connect channel and pick an entry",
      errorAction: "On any other error, start again from Connect channel.",
    },
    {
      locale: "de" as const,
      query: "Fehler beim Verbinden des Gmail-Kanals",
      setupAction: "Klicken Sie auf Kanal verbinden und wählen Sie einen Eintrag",
      errorAction: "Bei jedem anderen Fehler beginnen Sie erneut mit Kanal verbinden.",
    },
  ])(
    "keeps the setup action and its initial error recovery in $locale",
    ({ locale, query, setupAction, errorAction }) => {
      const setup = docsCorpusSections("docs", locale).find(
        (section) => section.slug === "app-profile" && section.anchor === "how-do-i-connect-a-channel",
      );
      expect(setup).toBeDefined();
      if (!setup) throw new Error("Missing initial channel connection fixture.");
      const candidates: RankableSection[] = Array.from({ length: 120 }, (_, id) => ({
        id,
        locale,
        section:
          id === 0
            ? setup
            : {
                pageTitle: "Unrelated",
                headingPath: ["Background"],
                text: "Other documentation.",
              },
      }));
      const options = docsRankSpec(candidates, "docs", query).questions[0].options;
      const evidence = optionEvidence(options.s0);
      expect(evidence).toContain(setupAction);
      expect(evidence).toContain(errorAction);
      expect(evidence).not.toContain("http://localhost:4000");
      expect(evidence.length).toBeLessThanOrEqual(400);
      let totalEvidenceChars = 0;
      for (const candidate of candidates) {
        const candidateEvidence = optionEvidence(options[`s${candidate.id}`]);
        expect(candidateEvidence.length).toBeLessThanOrEqual(candidate.id < 20 ? 400 : 80);
        totalEvidenceChars += candidateEvidence.length;
      }
      expect(totalEvidenceChars).toBeLessThanOrEqual(16_000);
    },
  );
});

describe("section ranker lifetime", () => {
  it("shares one docs identity across tools in one toolset and separates another toolset", async () => {
    const seen: (SectionRanker | undefined)[] = [];
    vi.spyOn(searchDocsTool, "execute").mockImplementation(() => {
      seen.push(currentSectionRanker("docs"));
      return Promise.resolve({
        text: "matches: none",
        structuredContent: { results: [], total: 0 },
      });
    });
    vi.spyOn(getDocsPageTool, "execute").mockImplementation(() => {
      seen.push(currentSectionRanker("docs"));
      return Promise.resolve({
        text: "Guide",
        structuredContent: {
          title: "Guide",
          url: "/guide",
          markdown: "Guide",
          excerpt: true,
        },
      });
    });
    type ExecutableTools = Record<
      string,
      {
        execute: (value: unknown, options: { toolCallId: string; messages: [] }) => Promise<unknown>;
      }
    >;
    const first = getAgentAiTools(deps("Create a webhook")) as unknown as ExecutableTools;
    await first.search_docs.execute(INPUT, {
      toolCallId: "search",
      messages: [],
    });
    await first.get_docs_page.execute(
      {
        slug: "webhooks",
        query: "create webhook",
        locale: "en",
        source: "docs",
      },
      {
        toolCallId: "get",
        messages: [],
      },
    );
    const second = getAgentAiTools(deps("Create a webhook")) as unknown as ExecutableTools;
    await second.search_docs.execute(INPUT, {
      toolCallId: "other-turn",
      messages: [],
    });
    expect(seen[0]).toBeTypeOf("function");
    expect(seen[1]).toBe(seen[0]);
    expect(seen[2]).not.toBe(seen[0]);
    expect(currentSectionRanker("docs")).toBeUndefined();
  });

  it("retains a bounded operation introduction beside a later matching detail", () => {
    const introduction =
      "The record editor is where you create and change the fields that store workspace data and define how each item in the workspace is represented in lists and linked to related items.";
    const detail = "A field lock blocks changes only after the administrator grants the restriction.";
    const candidates = Array.from({ length: 120 }, (_, id) => ({
      id,
      locale: "en" as const,
      section: {
        pageTitle: "Records",
        headingPath: ["Fields"],
        text: `${introduction} ${"Workspace configuration remains available. ".repeat(40)} ${detail}`,
      },
    }));
    const option = docsRankSpec(candidates, "docs", "record field lock").questions[0].options.s0;
    expect(option).toContain("The record editor is where you create and change the fields");
    expect(option).toContain(detail);
    expect(option.length).toBeLessThanOrEqual("Records > Fields: ".length + 400);
  });
});

describe("canonical webhook secret permissions", () => {
  it.each([
    {
      locale: "en" as const,
      query: "Who can see saved webhook secrets?",
      visibility: "Read access All plus Edit: Edit webhooks and see saved Secret and Custom headers values.",
      readOnly: "Read access All, no checkbox ticked: A saved Secret and each Custom headers value appear as ********",
    },
    {
      locale: "de" as const,
      query: "Wer kann gespeicherte Webhook-Secrets sehen?",
      visibility:
        "Lesen Alle plus Bearbeiten: Webhooks bearbeiten und gespeicherte Werte von Secret und Eigene Header sehen.",
      readOnly:
        "Lesen Alle, keine Checkbox angehakt: Ein gespeichertes Secret und jeder Wert unter Eigene Header erscheinen als ********",
    },
  ])("keeps the complete $locale grant and read-only boundary", ({ locale, query, visibility, readOnly }) => {
    const section = docsCorpusSections("docs", locale).find(
      (candidate) => candidate.slug === "webhooks" && candidate.anchor === "who-can-see-and-change-webhooks",
    );
    if (!section) throw new Error("Missing canonical webhook permission section.");
    const candidates = Array.from({ length: 120 }, (_, id) => ({
      id,
      locale,
      section:
        id === 0
          ? section
          : {
              pageTitle: "Unrelated",
              headingPath: ["History"],
              text: "Unrelated history.",
            },
    }));
    const [question] = docsRankSpec(candidates, "docs", query).questions;
    const evidence = optionEvidence(question.options.s0);
    expect(evidence).toContain(visibility);
    expect(evidence).toContain(readOnly);
    expect(evidence.length).toBeLessThanOrEqual(400);
    expect(Object.keys(question.options)).toHaveLength(121);
    let characters = 0;
    for (const candidate of candidates) {
      const excerpt = optionEvidence(question.options[`s${candidate.id}`]);
      expect(excerpt.length).toBeLessThanOrEqual(candidate.id < 20 ? 400 : 80);
      characters += excerpt.length;
    }
    expect(characters).toBeLessThanOrEqual(16_000);
  });
});

describe("complete record procedures in bounded classifier evidence", () => {
  it.each([
    {
      locale: "en" as const,
      query: "How do I set up pipeline stages?",
      anchor: "how-do-i-change-a-deal-stage-or-a-task-status-on-the-board",
      controls: [
        "Stage and status are Single choice fields.",
        "To edit the stages or their probabilities, open the field in Configure for Deals",
        "Drag the card to another column on the Deals or Tasks board",
      ],
    },
    {
      locale: "de" as const,
      query: "Wie richte ich Pipeline-Phasen ein?",
      anchor: "how-do-i-change-a-deal-stage-or-a-task-status-on-the-board",
      controls: [
        "Phase und Status sind Felder vom Typ Einzelauswahl.",
        "Um Phasen oder ihre Wahrscheinlichkeiten zu bearbeiten, öffnen Sie das Feld unter Konfigurieren für Deals",
        "Ziehen Sie die Karte auf dem Board von Deals oder Aufgaben in eine andere Spalte",
      ],
    },
    {
      locale: "en" as const,
      query: "How do I sort tasks by due date?",
      anchor: "how-do-i-switch-between-table-and-board-view",
      controls: [
        "In Appearance, choose Table or Board.",
        "Sort by sorts by any field, including custom and calculated ones",
      ],
    },
    {
      locale: "de" as const,
      query: "Wie sortiere ich Aufgaben nach Fälligkeit?",
      anchor: "how-do-i-switch-between-table-and-board-view",
      controls: [
        "Wählen Sie unter Darstellung Tabelle oder Board.",
        "Sortieren nach sortiert nach jedem Feld, auch nach benutzerdefinierten und berechneten",
      ],
    },
  ])(
    "retains the actual $locale procedure for $query at the existing pool budget",
    ({ locale, query, anchor, controls }) => {
      const page = rawDocsManifest.docs[locale]["app-records"];
      const section = splitSections({
        slug: "app-records",
        source: "docs",
        pageTitle: page.title,
        markdown: page.content,
      }).find((candidate) => candidate.anchor === anchor);
      expect(section).toBeDefined();
      if (!section) throw new Error("Expected public record procedure section");
      const candidates = Array.from({ length: 120 }, (_, id) => ({
        id,
        section,
        locale,
      }));
      const [question] = docsRankSpec(candidates, "docs", query).questions;
      const evidence = optionEvidence(question.options.s0);
      for (const control of controls) expect(evidence).toContain(control);
      expect(evidence).not.toContain("http://localhost:4000");
      expect(evidence.length).toBeLessThanOrEqual(400);
    },
  );
});

describe("channel connection prerequisites in bounded classifier evidence", () => {
  it.each([
    {
      locale: "en" as const,
      query: "Error connecting my Gmail channel",
      controls: [
        "Open a channel you own:",
        "Reactivate (for Reconnect needed, Permission issue, Error, Stopped)",
        "goes to the connection page for the same account and back.",
      ],
    },
    {
      locale: "de" as const,
      query: "Fehler beim Verbinden des Gmail-Kanals",
      controls: [
        "Öffnen Sie einen eigenen Kanal:",
        "Reaktivieren (bei Erneute Verbindung nötig, Berechtigungsproblem, Fehler, Gestoppt)",
        "führt zur Verbindungsseite für dasselbe Konto und zurück.",
      ],
    },
    {
      locale: "en" as const,
      query: "My initial email connection failed",
      controls: [
        "Open a channel you own:",
        "Reactivate (for Reconnect needed, Permission issue, Error, Stopped)",
        "goes to the connection page for the same account and back.",
      ],
    },
    {
      locale: "de" as const,
      query: "Das erste Verbinden meines E-Mail-Kanals schlägt fehl",
      controls: [
        "Öffnen Sie einen eigenen Kanal:",
        "Reaktivieren (bei Erneute Verbindung nötig, Berechtigungsproblem, Fehler, Gestoppt)",
        "führt zur Verbindungsseite für dasselbe Konto und zurück.",
      ],
    },
  ])("retains the owner condition and the statuses Reactivate recovers in $locale", ({ locale, query, controls }) => {
    const page = rawDocsManifest.docs[locale]["app-profile"];
    const section = splitSections({
      slug: "app-profile",
      source: "docs",
      pageTitle: page.title,
      markdown: page.content,
    }).find((candidate) => candidate.anchor === "how-do-i-reactivate-resync-or-disconnect-a-channel");
    expect(section).toBeDefined();
    if (!section) throw new Error("Expected public channel recovery section");
    const candidates = Array.from({ length: 120 }, (_, id) => ({
      id,
      section,
      locale,
    }));
    const [question] = docsRankSpec(candidates, "docs", query).questions;
    const evidence = optionEvidence(question.options.s0);
    for (const control of controls) expect(evidence).toContain(control);
    expect(evidence.length).toBeLessThanOrEqual(400);
  });
});

describe("connection renewal evidence", () => {
  it.each([
    ["en", "Claude reconnect", "Use it within any 30-day window", "go idle longer and you approve once more"],
    ["de", "Claude erneute Verbindung", "innerhalb von 30 Tagen", "bleiben Sie länger untätig"],
  ] as const)("keeps the %s lifetime rule in a 120-option classifier pool", (locale, query, renewal, idle) => {
    const page = rawDocsManifest.docs[locale]["connect-custom-connector"];
    const section = splitSections({
      slug: "connect-custom-connector",
      source: "docs",
      pageTitle: page.title,
      markdown: page.content,
    }).find(({ anchor }) => anchor === "it-syncs-and-stays-connected");
    if (!section) throw new Error("Expected public connector lifetime section");
    const candidates: RankableSection[] = Array.from({ length: 120 }, (_, id) => ({
      id,
      locale,
      section:
        id === 0
          ? section
          : {
              pageTitle: "Independent workspace section",
              headingPath: ["Other topic"],
              text: "Other details.",
            },
    }));
    const excerpt = optionEvidence(docsRankSpec(candidates, "docs", query).questions[0].options.s0);
    expect(excerpt).toContain(renewal);
    expect(excerpt).toContain(idle);
    expect(excerpt.length).toBeLessThanOrEqual(400);
    const full = optionEvidence(docsRankSpec(candidates.slice(0, 1), "docs", query).questions[0].options.s0);
    expect(full).toContain(renewal);
    expect(full).toContain(idle);
    expect(full.length).toBeLessThanOrEqual(800);
  });
});

describe("requested documentation question and destination evidence", () => {
  it("distinguishes a requested status definition from help with a reported problem", () => {
    const instruction = docsRankSpec(RANKABLE, "docs", "A channel reports a status").questions[0].instruction;

    expect(instruction).toMatch(/question kind.*meaning or governing facts.*procedure.*navigation.*recovery/iu);
    expect(instruction).toMatch(/question defining a status.*meaning.*reporting their own failure.*remediation/iu);
    expect(instruction).toMatch(/own heading and Content.*requested fact or operation/iu);
    expect(instruction).toContain("choose none only if no section answers it at all");
    expect(docsRankState("reported status", "A channel reports a status")).toEqual({
      latest_user_message: "A channel reports a status",
      agent_query: "reported status",
    });
  });

  it("retains different human destination labels when two inline app links share the same target", () => {
    const candidates: RankableSection[] = ["Credential collection", "Workspace directory"].map((label, id) => ({
      id,
      section: {
        pageTitle: "Workspace",
        headingPath: ["Destination"],
        text: `Open [${label}](http://localhost:4000/settings/api-keys) for this destination.`,
      },
    }));
    const options = docsRankSpec(candidates, "docs", "destination page address").questions[0].options;

    expect(options.s0).toContain("Open Credential collection for this destination.");
    expect(options.s1).toContain("Open Workspace directory for this destination.");
    for (const option of [options.s0, options.s1]) {
      expect(option).not.toContain("http://localhost:4000");
      expect(optionEvidence(option).length).toBeLessThanOrEqual(800);
    }
  });

  it("keeps own facts beside long inline app link labels inside the unchanged 120-candidate evidence envelope", () => {
    const candidates: RankableSection[] = Array.from({ length: 120 }, (_, id) => ({
      id,
      section: {
        pageTitle: "Records",
        headingPath: ["Stored relation"],
        text: `A relation stores quantity.\nOpen [${"Destination label ".repeat(30).trim()}](http://localhost:4000/open/records/deal).`,
      },
    }));
    const options = docsRankSpec(candidates, "docs", "relation quantity").questions[0].options;
    let total = 0;

    expect(Object.keys(options)).toHaveLength(121);
    for (const { id } of candidates) {
      const evidence = optionEvidence(options[`s${id}`]);
      expect(evidence).toContain("A relation stores quantity.");
      expect(evidence).not.toContain("http://localhost:4000");
      expect(evidence.length).toBeLessThanOrEqual(id < 20 ? 400 : 80);
      total += evidence.length;
    }
    expect(total).toBeLessThanOrEqual(16_000);
  });
});

describe("matching opening instructions in a full classifier pool", () => {
  it("retains the primary German key creation introduction before later client setup text", () => {
    const section = docsCorpusSections("docs", "de").find(
      (candidate) => candidate.slug === "api-keys" && candidate.anchor === "how-do-i-create-an-api-key",
    );
    if (!section) throw new Error("Missing canonical API key creation section.");
    const candidates: RankableSection[] = Array.from({ length: 120 }, (_, id) => ({
      id,
      locale: "de",
      section:
        id === 0
          ? section
          : {
              pageTitle: "Unrelated",
              headingPath: ["History"],
              text: "Other history.",
            },
    }));
    const [question] = docsRankSpec(candidates, "docs", "Wie erstelle ich einen API-Schlüssel?").questions;
    const evidence = optionEvidence(question.options.s0);
    expect(evidence).toContain("Öffnen Sie in den Einstellungen API-Schlüssel und klicken Sie auf Hinzufügen.");
    expect(evidence).toContain("klicken Sie auf API-Key erstellen");
    expect(evidence.indexOf("Öffnen Sie in den Einstellungen")).toBeLessThan(
      evidence.indexOf("klicken Sie auf API-Key erstellen"),
    );
    expect(evidence).not.toContain("http://localhost:4000");
    expect(Object.keys(question.options)).toHaveLength(121);
    let characters = 0;
    for (const candidate of candidates) {
      const excerpt = optionEvidence(question.options[`s${candidate.id}`]);
      expect(excerpt.length).toBeLessThanOrEqual(candidate.id < 20 ? 400 : 80);
      characters += excerpt.length;
    }
    expect(characters).toBeLessThanOrEqual(16_000);
  });
});
