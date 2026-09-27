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
  AGENT_DOCS_RERANK: "off" as "off" | "jev" | "gemini",
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

import { docsSectionCandidates, searchDocsTool, type DocsRerankCandidate } from "@/features/mcp-tools/docs.mcp-tools";

import { getAgentAiTools, type AgentToolDeps } from "../agent-tools";
import { collectClassifierCharges } from "../classifier/metered";
import { JEV_EVALUATE_URL } from "../classifier/jev-runner";
import {
  DOCS_RERANK_TIMEOUT_MS,
  docsRerankChoice,
  docsRerankPlainText,
  docsRerankSpec,
  hostedDocsReranker,
} from "../docs-rerank";

const QUERY = "which header does the REST API expect for auth";
const INPUT = { query: QUERY, locale: "en", source: "docs" };

function deps(): AgentToolDeps {
  return {
    runUiCommand: vi.fn(),
    requestApproval: vi.fn(),
    resolveApprovalContext: vi.fn().mockImplementation((_toolName, input) => Promise.resolve({ ok: true, input })),
    createSupportTicket: vi.fn(),
    runExactlyOnce: (_toolCallId, _toolName, run) => run(),
    runInCallerContext: (run) => run(),
    resultMaxChars: 6000,
  };
}

function runSearchDocs(input: unknown) {
  const tool = getAgentAiTools(deps()).search_docs as unknown as {
    execute: (
      value: unknown,
      options: { toolCallId: string; messages: [] },
    ) => Promise<{ ok: boolean; result: string }>;
  };
  return collectClassifierCharges(() => tool.execute(input, { toolCallId: "call-1", messages: [] }));
}

function jevChoosing(pick: (keys: string[]) => string) {
  return vi.fn((_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { questions: { best: { criteria: Record<string, string> } } };
    const choice = pick(Object.keys(body.questions.best.criteria));
    return Promise.resolve(
      new Response(
        JSON.stringify({
          answers: { best: { type: "choice", choice, confidence: 0.8 } },
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
  envState.AGENT_DOCS_RERANK = "off";
  envState.AI_GATEWAY_API_KEY = "test-gateway-key";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("docs re-rank classifier spec", () => {
  it("asks one choice over the candidates' page, heading path and a plain 400-character excerpt", () => {
    const candidates = docsSectionCandidates(QUERY, "en", "docs");
    const spec = docsRerankSpec(candidates);
    const [question] = spec.questions;
    const first = candidates[0];

    expect(spec.id).toBe("docs-rerank");
    expect(question).toMatchObject({ id: "best", type: "choice" });
    if (question.type !== "choice") throw new Error("expected a choice question");
    expect(Object.keys(question.options)).toEqual(candidates.map(({ id }) => `s${id}`));
    expect(question.options[`s${first.id}`]).toBe(
      `${first.section.pageTitle} > ${first.section.headingPath.join(" > ")}: ${docsRerankPlainText(first.section.text).slice(0, 400)}`,
    );
  });

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

  it("gives the classifier 800 ms", () => {
    expect(DOCS_RERANK_TIMEOUT_MS).toBe(800);
  });
});

describe("hosted docs re-rank", () => {
  it("is off unless its switch names a model on a hosted instance", () => {
    expect(hostedDocsReranker()).toBeUndefined();
    envState.AGENT_DOCS_RERANK = "jev";
    expect(hostedDocsReranker()).toBeTypeOf("function");
    envState.APP_MODE = "self-hosted";
    expect(hostedDocsReranker()).toBeUndefined();
  });

  it("re-ranks hosted Mate's search_docs and meters the classifier call", async () => {
    envState.AGENT_DOCS_RERANK = "jev";
    const fetchMock = jevChoosing((keys) => keys.at(-1) as string);
    vi.stubGlobal("fetch", fetchMock);
    const chosen = docsSectionCandidates(QUERY, "en", "docs").at(-1) as DocsRerankCandidate;

    const { value, charges } = await runSearchDocs(INPUT);

    expect(fetchMock).toHaveBeenCalledWith(JEV_EVALUATE_URL, expect.objectContaining({ signal: expect.anything() }));
    expect(value.ok).toBe(true);
    expect(value.result).toContain(`\nexcerpt=\n## ${chosen.section.headingPath.join(" > ")}\n`);
    expect(value.result.split("\n")[1]).toBe(`docs:${chosen.section.slug}#${chosen.section.anchor}`);
    expect(charges).toEqual([
      { use: "docs_rerank", model: "jev", costMicrocents: 2000, measured: true, answered: true },
    ]);
  });

  it("falls back to the keyword output and still meters a failed classifier call", async () => {
    envState.AGENT_DOCS_RERANK = "jev";
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("{}", { status: 504 }))),
    );

    const { value, charges } = await runSearchDocs(INPUT);

    expect(value.result).toBe(searchDocsTool.execute(INPUT as never).text);
    expect(charges).toHaveLength(1);
    expect(charges[0]).toMatchObject({ use: "docs_rerank", measured: false, answered: false });
  });

  it("leaves search_docs untouched and calls no classifier when the switch is off", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { value, charges } = await runSearchDocs(INPUT);

    expect(value.result).toBe(searchDocsTool.execute(INPUT as never).text);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(charges).toEqual([]);
  });

  it("never re-ranks for external MCP clients, even with the switch on", () => {
    envState.AGENT_DOCS_RERANK = "jev";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(searchDocsTool.execute(INPUT as never).text).not.toContain("\nexcerpt=\n");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
