import { describe, expect, it } from "vitest";

import {
  AGENT_E2E_CASES,
  containsPhoneNumber,
  linksDocsPage,
  linksWikiPage,
  looksGerman,
  mentionsNumber,
  toolUseVerdict,
} from "../cases";
import { DEFAULT_CAP_USD, parseAgentE2eFlags, requireAgentE2eEnvironment, serverEnvironment } from "../env";
import { admitsNextCase, nextCaseReserveMicrocents, renderTable, usdToMicrocents, type CaseRow } from "../report";
import { parseSseChunk, recordFrameTiming, type SseTiming } from "../sse";

const LOCAL = "postgresql://postgres:postgres@127.0.0.1:5432/customermates";
const ENVIRONMENT = {
  DATABASE_URL: LOCAL,
  DIRECT_URL: LOCAL,
  AI_GATEWAY_API_KEY: "gateway-key",
  BETTER_AUTH_SECRET: "secret",
  NEXT_PUBLIC_SENTRY_DSN: "",
};

const row = (costMicrocents: number): CaseRow => ({
  id: "case",
  pass: true,
  reason: "ok",
  costMicrocents,
  rounds: 2,
  firstOutputMs: 900,
  firstTextMs: 1_400,
  totalMs: 3_000,
});

describe("agent e2e flags and environment", () => {
  it("defaults to a 0.30 USD cap on port 4000 with a fresh build", () => {
    expect(parseAgentE2eFlags([])).toEqual({ capUsd: DEFAULT_CAP_USD, port: 4000, build: true, cases: null });
    expect(DEFAULT_CAP_USD).toBe(0.3);
    expect(parseAgentE2eFlags(["--cap", "0.1", "--port", "4123", "--skip-build", "--cases", "german,docs-link"])).toEqual({
      capUsd: 0.1,
      port: 4123,
      build: false,
      cases: ["german", "docs-link"],
    });
  });

  it.each([["--cap", "0"], ["--cap", "-1"], ["--cap", "nope"], ["--cap", "9"], ["--port", "80"], ["--bogus"]])(
    "rejects %s %s",
    (...argv) => {
      expect(() => parseAgentE2eFlags(argv)).toThrow();
    },
  );

  it("requires the gateway key from the credential store, a local database and no Sentry DSN", () => {
    const flags = parseAgentE2eFlags([]);
    expect(requireAgentE2eEnvironment(flags, ENVIRONMENT, "/repo")).toEqual({
      appUrl: "http://localhost:4000",
      databaseUrl: new URL(LOCAL).href,
      workflowDataDir: "/repo/.next/agent-e2e-workflow-data",
    });
    expect(() => requireAgentE2eEnvironment(flags, { ...ENVIRONMENT, AI_GATEWAY_API_KEY: "XXX" })).toThrow(/cm-env/);
    expect(() => requireAgentE2eEnvironment(flags, { ...ENVIRONMENT, NEXT_PUBLIC_SENTRY_DSN: "https://dsn" })).toThrow(
      /SENTRY/,
    );
    expect(() =>
      requireAgentE2eEnvironment(flags, { ...ENVIRONMENT, DATABASE_URL: "postgresql://u:p@db.example.com/app" }),
    ).toThrow(/loopback/);
  });

  it("unpauses hosted AI and caps hosted spend only for the server it starts", () => {
    const launch = { ...ENVIRONMENT, HOSTED_AI_PROVIDER_WORK_PAUSED: "true" };
    const server = serverEnvironment({
      appUrl: "http://localhost:4000",
      port: 4000,
      workflowDataDir: "/repo/.next/agent-e2e-workflow-data",
      monthlySpendCapMicrocents: 30_000_000n,
      environment: launch,
    });
    expect(server).toMatchObject({
      HOSTED_AI_PROVIDER_WORK_PAUSED: "false",
      HOSTED_AI_OPERATOR_CONTROLS_ENABLED: "true",
      HOSTED_AI_MONTHLY_SPEND_CAP_MICROCENTS: "30000000",
      WORKFLOW_TARGET_WORLD: "local",
      WORKFLOW_LOCAL_DATA_DIR: "/repo/.next/agent-e2e-workflow-data",
      WORKFLOW_LOCAL_BASE_URL: "http://localhost:4000",
      BASE_URL: "http://localhost:4000",
    });
    expect(launch.HOSTED_AI_PROVIDER_WORK_PAUSED).toBe("true");
  });
});

describe("agent e2e spend cap", () => {
  it("reserves at least three cents and half again the costliest case before starting another", () => {
    expect(nextCaseReserveMicrocents([])).toBe(usdToMicrocents(0.03));
    expect(nextCaseReserveMicrocents([row(4_000_000), row(1_000_000)])).toBe(6_000_000);
    expect(admitsNextCase(usdToMicrocents(0.27), usdToMicrocents(0.3), [])).toBe(true);
    expect(admitsNextCase(usdToMicrocents(0.27) + 1, usdToMicrocents(0.3), [])).toBe(false);
  });

  it("renders one row per case with cost, rounds and timings", () => {
    const table = renderTable([row(1_234_567)]);
    expect(table).toContain("first output ms");
    expect(table).toMatch(/\| case\s+\| pass\s+\| ok\s+\| 0\.0123\s+\| 2\s+\| 900\s+\| 1400\s+\| 3000\s+\|/);
  });
});

describe("agent e2e stream timing", () => {
  it("parses SSE frames across chunk boundaries", () => {
    const first = parseSseChunk('id: 1\ndata: {"seq":1,"type":"delta","text":"Hi"}\n\nid: 2\ndata: {"seq":2,');
    expect(first.frames).toEqual([{ seq: 1, type: "delta", text: "Hi" }]);
    const second = parseSseChunk(`${first.rest}"type":"turn_done"}\n\n`);
    expect(second.frames).toEqual([{ seq: 2, type: "turn_done" }]);
    expect(second.rest).toBe("");
  });

  it("times the first visible output and the first answer text separately", () => {
    const timing: SseTiming = { firstOutputMs: null, firstTextMs: null, lastFrameMs: null };
    recordFrameTiming(timing, { type: "stream_checkpoint" }, 100);
    recordFrameTiming(timing, { type: "activity" }, 400);
    recordFrameTiming(timing, { type: "delta", text: " " }, 500);
    recordFrameTiming(timing, { type: "delta", text: "Four" }, 900);
    recordFrameTiming(timing, { type: "turn_done" }, 1_200);
    expect(timing).toEqual({ firstOutputMs: 400, firstTextMs: 900, lastFrameMs: 1_200 });
  });
});

describe("agent e2e deterministic checks", () => {
  it("keeps between eight and twelve uniquely named cases", () => {
    const ids = AGENT_E2E_CASES.map((entry) => entry.id);
    expect(ids.length).toBeGreaterThanOrEqual(8);
    expect(ids.length).toBeLessThanOrEqual(12);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("recognises a stated count without matching larger numbers", () => {
    expect(mentionsNumber("There are 4 deals in Negotiation.", 4, ["four"])).toBe(true);
    expect(mentionsNumber("Four deals.", 4, ["four"])).toBe(true);
    expect(mentionsNumber("There are 14 deals worth EUR 4,500.", 4, ["four"])).toBe(false);
    expect(mentionsNumber("Wir haben drei Organisationen.", 3, ["drei"])).toBe(true);
  });

  it("tells German from English replies", () => {
    expect(looksGerman("Im CRM gibt es derzeit 3 Organisationen.")).toBe(true);
    expect(looksGerman("There are 3 organizations in the CRM.")).toBe(false);
  });

  it("flags invented phone numbers but not counts or dates", () => {
    expect(containsPhoneNumber("Her number is +49 30 1234567.")).toBe(true);
    expect(containsPhoneNumber("No phone number is recorded for Maria Okafor.")).toBe(false);
  });

  it("requires a dynamic record tool and rejects forbidden writes", () => {
    const counting = { anyOf: ["query_crm_records", "query_crm_measure"] };
    expect(toolUseVerdict(["load_toolset", "query_crm_records"], counting)).toBeNull();
    expect(toolUseVerdict(["search_crm_records"], { anyOf: ["query_crm_records"] })).toEqual({
      pass: false,
      reason: "expected one of query_crm_records; called search_crm_records",
    });
    expect(toolUseVerdict([], { anyOf: ["mutate_crm_record"] })?.reason).toContain("called no tools");
    expect(toolUseVerdict(["read_crm_record", "mutate_crm_record"], { noneOf: ["mutate_crm_record"] })).toEqual({
      pass: false,
      reason: "must not call mutate_crm_record",
    });
  });

  it("asserts on the dynamic record tools rather than removed per-entity tools", () => {
    const source = AGENT_E2E_CASES.map((entry) => entry.check.toString()).join("\n");
    expect(source).not.toMatch(/\b(create|update|delete)_(contacts|deals|organizations|services|tasks)\b/);
    expect(AGENT_E2E_CASES.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(["link-records", "configure-field"]),
    );
  });

  it("finds Knowledge Base and documentation links", () => {
    const id = "6f1c2b9e-4d3a-4b8c-9e7f-1a2b3c4d5e6f";
    expect(linksWikiPage(`See [Refund policy](http://localhost:4000/en/wiki?page=${id}).`, id)).toBe(true);
    expect(linksWikiPage("See the Refund policy page.", id)).toBe(false);
    expect(linksDocsPage("Read [API keys](http://localhost:4000/en/docs/api-keys).")).toBe(true);
    expect(linksDocsPage("Open /profile/api-keys in the app.")).toBe(false);
  });
});
