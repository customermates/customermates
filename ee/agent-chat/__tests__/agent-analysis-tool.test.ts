import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
  createMockDiModule,
} from "@/tests/helpers/interactor-test-setup";
import { ROUTING_LOCALES } from "@/i18n/locale-registry";

const mockUser = createMockUser();
const switches = vi.hoisted(() => ({ enabled: true }));

vi.mock("@/env", () => ({
  env: {
    ...MOCK_ENV_MODULE.env,
    get AGENT_ANALYSIS_TOOL_ENABLED() {
      return switches.enabled;
    },
  },
}));
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { agentActivityCopy, describeAgentTool } from "../agent-activity";
import { AGENT_HOSTED_TOOL_ANNOTATIONS, getAgentAiToolDefinitions } from "../agent-tools";
import { isReadOnlyTool, requiresApproval } from "../gated-tools";
import { internalToolIdentity } from "../tool-identity";

function translatorFor(locale: string) {
  const messages = JSON.parse(readFileSync(join(process.cwd(), "i18n", "locales", `${locale}.json`), "utf8")) as Record<
    string,
    unknown
  >;
  return (key: string) => {
    const value = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], messages);
    if (typeof value !== "string") throw new Error(`missing ${locale} message ${key}`);
    return value;
  };
}

beforeEach(() => {
  switches.enabled = true;
});

describe("analyze_records on the hosted surface", () => {
  it("is offered with reads and code while its switch is on, and not at all when it is off", () => {
    const offered = getAgentAiToolDefinitions("vertex").find((definition) => definition.name === "analyze_records");
    expect(offered?.description).toMatch(/median/);
    expect(JSON.stringify(offered?.inputSchema)).toContain('"reads"');
    expect(JSON.stringify(offered?.inputSchema)).toContain('"code"');

    switches.enabled = false;
    expect(getAgentAiToolDefinitions("vertex").map((definition) => definition.name)).not.toContain("analyze_records");
  });

  it("is read-only, so it never asks for approval and never counts as a write", () => {
    const annotations = AGENT_HOSTED_TOOL_ANNOTATIONS.analyze_records;
    expect(isReadOnlyTool({ annotations })).toBe(true);
    expect(requiresApproval(internalToolIdentity("analyze_records"), { annotations }, {})).toBe(false);
  });

  it("shows as analyzing the entity of its first read, with copy in every locale", () => {
    const activity = describeAgentTool(internalToolIdentity("analyze_records"), {
      reads: [{ tool: "list_records", input: JSON.stringify({ entity: "deal" }) }],
      code: "(data) => data",
    });
    expect(activity).toMatchObject({ kind: "records.analyze", resource: "deals", risk: "read" });
    for (const locale of ROUTING_LOCALES) {
      const copy = agentActivityCopy(activity, translatorFor(locale));
      for (const text of [copy.running, copy.done, copy.error]) expect(text).toContain("{resource}");
    }
    expect(
      describeAgentTool(internalToolIdentity("analyze_records"), { reads: [{ tool: "x", input: "{nope" }] }),
    ).toMatchObject({
      kind: "records.analyze",
      resource: undefined,
    });
  });
});
