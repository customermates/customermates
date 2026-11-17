import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RootStore } from "@/core/stores/root.store";
import type { AgentJobDetail, AgentJobSummary } from "@/features/agent-jobs/agent-job.schema";

const testContext = vi.hoisted(() => ({ rootStore: null as RootStore | null }));

vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => testContext.rootStore }));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({
    formatTime: (date: Date) => `time:${date.toISOString().slice(11, 16)}`,
    formatNumericalShortDateTime: (date: Date) => `date:${date.toISOString().slice(0, 10)}`,
    formatNumber: (value: number) => String(value),
  }),
}));
vi.mock("@/components/agent-keys/agent-key-actions", () => ({
  getAgentJobAction: vi.fn(),
  getAgentJobsAction: vi.fn(),
}));
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () =>
    Object.assign(
      (key: string, values?: Record<string, string | number>) =>
        values
          ? `${key}(${Object.entries(values)
              .map(([name, value]) => `${name}=${value}`)
              .join(",")})`
          : key,
      { rich: (key: string): ReactNode => createElement("span", null, key) },
    ),
}));

import { AGENT_RUNNER_JOB_ERRORS } from "@/features/agent-runners/agent-runner.schema";

import { RUNNER_ERRORS } from "../../../packages/runner/src/run-job";
import { AgentRunsStore } from "../agent-runs.store";
import { agentJobErrorLabel } from "../agent-job-labels";
import { AgentJobTranscript } from "../agent-job-transcript";
import { AgentRunsCard } from "../agent-runs-card";

const AT = "2026-11-17T08:15:00.000Z";

function summary(overrides: Partial<AgentJobSummary> = {}): AgentJobSummary {
  return {
    id: "00000000-0000-4000-8000-0000000000a1",
    runtime: "ownKey",
    status: "succeeded",
    sourceKind: "automation",
    sourceId: null,
    model: "claude-sonnet-5-5",
    runnerId: null,
    attempts: 1,
    inputTokens: 1200,
    outputTokens: 80,
    costMicrocents: null,
    error: null,
    result: { text: "Created one action.", reason: "stop", toolCalls: 2 },
    startedAt: AT,
    finishedAt: AT,
    createdAt: AT,
    ...overrides,
  };
}

const TRANSCRIPT: AgentJobDetail["transcript"] = [
  { type: "message", at: AT, role: "user", text: "Follow up on the offer" },
  { type: "toolCall", at: AT, toolCallId: "c1", name: "query_crm_records", argumentsDigest: '{"typeId":"deals"}' },
  { type: "toolResult", at: AT, toolCallId: "c1", name: "query_crm_records", ok: true, summary: "3 rows" },
  { type: "toolCall", at: AT, toolCallId: "c2", name: "mutate_crm_record", argumentsDigest: "{}" },
  { type: "toolResult", at: AT, toolCallId: "c2", name: "mutate_crm_record", ok: false, summary: "Declined" },
  { type: "message", at: AT, role: "assistant", text: "I could not change it." },
  { type: "finish", at: AT, reason: "toolLimit", text: "Stopped early." },
];

function renderRuns(items: AgentJobSummary[], nextCursor: string | null = null) {
  const store = new AgentRunsStore({ localeStore: { getTranslation: (key: string) => key } } as unknown as RootStore);
  testContext.rootStore = { agentRunsStore: store } as unknown as RootStore;
  return {
    store,
    markup: renderToStaticMarkup(createElement(AgentRunsCard, { page: { jobs: items, nextCursor } })),
  };
}

beforeEach(() => {
  testContext.rootStore = null;
});

describe("AgentJobTranscript", () => {
  it("lists every step in order with who spoke, which tool ran and how it ended", () => {
    const markup = renderToStaticMarkup(
      createElement(AgentJobTranscript, { job: { transcript: TRANSCRIPT, promptUntrusted: false } }),
    );

    const order = [
      "AgentJobs.transcript.user",
      "Follow up on the offer",
      "AgentJobs.transcript.called(name=query_crm_records)",
      "AgentJobs.transcript.result(name=query_crm_records)",
      "3 rows",
      "AgentJobs.transcript.called(name=mutate_crm_record)",
      "AgentJobs.transcript.resultFailed(name=mutate_crm_record)",
      "Declined",
      "AgentJobs.transcript.assistant",
      "AgentJobs.transcript.finish.toolLimit",
      "Stopped early.",
    ].map((text) => markup.indexOf(text));
    expect(order.every((position) => position >= 0)).toBe(true);
    expect([...order].sort((left, right) => left - right)).toEqual(order);
    expect(markup).toContain("&quot;typeId&quot;:&quot;deals&quot;");
    expect(markup).toContain('aria-label="AgentJobs.transcript.label"');
    expect(markup).not.toContain("AgentJobs.transcript.untrusted");
  });

  it("marks where a further attempt starts and keeps the steps of the attempt before it", () => {
    const second: AgentJobDetail["transcript"] = [
      { type: "message", at: AT, role: "user", text: "Follow up on the offer" },
      { type: "toolCall", at: AT, toolCallId: "c1", name: "query_crm_records", argumentsDigest: "{}" },
      { type: "attempt", at: "2026-11-17T08:27:00.000Z", attempt: 2 },
      { type: "message", at: AT, role: "user", text: "Follow up on the offer" },
      { type: "finish", at: AT, reason: "stop", text: "Done on the second try." },
    ];
    const markup = renderToStaticMarkup(
      createElement(AgentJobTranscript, { job: { transcript: second, promptUntrusted: false } }),
    );

    const marker = markup.indexOf("AgentJobs.transcript.attempt(attempt=2) · time:08:27");
    expect(marker).toBeGreaterThan(markup.indexOf("AgentJobs.transcript.called(name=query_crm_records)"));
    expect(marker).toBeLessThan(markup.lastIndexOf("AgentJobs.transcript.user"));
    expect(markup.split("Follow up on the offer")).toHaveLength(3);
    expect(markup).toContain('data-transcript-event="attempt"');
  });

  it("says when the run started from outside the workspace and when nothing was recorded", () => {
    const untrusted = renderToStaticMarkup(
      createElement(AgentJobTranscript, { job: { transcript: TRANSCRIPT, promptUntrusted: true } }),
    );
    const empty = renderToStaticMarkup(
      createElement(AgentJobTranscript, { job: { transcript: [], promptUntrusted: false } }),
    );

    expect(untrusted).toContain("AgentJobs.transcript.untrusted");
    expect(empty).toContain("AgentJobs.transcript.empty");
    expect(empty).not.toContain("<ol");
  });

  it("says that the steps are kept from a reader who is neither the owner nor an admin, instead of 'nothing recorded'", () => {
    const restricted = renderToStaticMarkup(
      createElement(AgentJobTranscript, { job: { transcript: [], promptUntrusted: false, restricted: true } }),
    );

    expect(restricted).toContain("AgentJobs.transcript.restricted");
    expect(restricted).toContain("data-transcript-restricted");
    expect(restricted).not.toContain("AgentJobs.transcript.empty");
  });
});

describe("the reason a run ended", () => {
  const t = ((key: string, values?: Record<string, string>) =>
    values ? `${key}(${Object.values(values).join(",")})` : key) as unknown as Parameters<typeof agentJobErrorLabel>[0];

  it.each([
    "queueExpired",
    "runnerRevoked",
    "ruleInactive",
    "ownerApiAccess",
    "planRequired",
    "planApiAccess",
    "contextLimit",
    "modelRequired",
    "runnerStopped",
    "runnerFailed",
    "timedOut",
    "ownerInactive",
  ])("names %s in its own words, not as a provider error", (code) => {
    expect(agentJobErrorLabel(t, code)).toBe(`AgentJobs.errors.${code}`);
  });

  it("has a label for every code the server and the runner end a runner job with", () => {
    for (const code of [...Object.values(AGENT_RUNNER_JOB_ERRORS), ...Object.values(RUNNER_ERRORS)])
      expect(agentJobErrorLabel(t, code)).toBe(`AgentJobs.errors.${code}`);
  });

  it("still shows an unknown code as what the provider returned", () => {
    expect(agentJobErrorLabel(t, "the client exited with code 1")).toBe(
      "AgentJobs.errors.provider(the client exited with code 1)",
    );
  });

  it("shows a finished runner job with its answer and tokens and without credits", () => {
    const { markup } = renderRuns([
      summary({
        runtime: "runner",
        model: null,
        costMicrocents: null,
        result: { text: "Three deals need a follow-up.", reason: "stop", toolCalls: 4 },
      }),
      summary({
        id: "00000000-0000-4000-8000-0000000000a3",
        runtime: "runner",
        status: "cancelled",
        error: "runnerRevoked",
        result: null,
      }),
    ]);

    expect(markup).toContain("Three deals need a follow-up.");
    expect(markup).toContain("AgentJobs.errors.runnerRevoked");
    expect(markup).not.toContain("AgentJobs.credits");
  });
});

describe("AgentRunsCard", () => {
  it("shows a run with its status, runtime, model, result, tokens and a toggle for the transcript", () => {
    const { markup } = renderRuns([summary()]);

    expect(markup).toContain('id="agent-runs"');
    expect(markup).toContain("AgentJobs.title");
    expect(markup).toContain('data-status="succeeded"');
    expect(markup).toContain("AgentJobs.status.succeeded");
    expect(markup).toContain("AgentRuntime.names.ownKey");
    expect(markup).toContain("claude-sonnet-5-5");
    expect(markup).toContain("Created one action.");
    expect(markup).toContain("AgentJobs.tokens(input=1200,output=80)");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain("AgentJobs.credits");
  });

  it("shows the credits a Mate run used and the reason a run failed", () => {
    const { markup } = renderRuns([
      summary({
        runtime: "mate",
        status: "failed",
        error: "creditsExhausted",
        costMicrocents: 5_000_000,
        result: null,
        model: null,
      }),
      summary({ id: "00000000-0000-4000-8000-0000000000a2", status: "failed", error: "APICallError:401" }),
    ]);

    expect(markup).toContain("AgentRuntime.names.mate");
    expect(markup).toContain("AgentJobs.errors.creditsExhausted");
    expect(markup).toContain("AgentJobs.credits(credits=");
    expect(markup).toContain("AgentJobs.errors.provider(code=APICallError:401)");
  });

  it("offers more runs only while there is another page, and says when there are none", () => {
    const more = renderRuns([summary()], "cursor-1").markup;
    const last = renderRuns([summary()], null).markup;
    const none = renderRuns([]).markup;

    expect(more).toContain("Common.actions.loadMore");
    expect(last).not.toContain("Common.actions.loadMore");
    expect(none).toContain("AgentJobs.empty");
    expect(none).not.toContain("<ul");
  });
});
