import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTranslator } from "next-intl";
import { z } from "zod";

import messages from "@/i18n/locales/en.json";

import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE, createMockDiModule } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const spies = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  runs: vi.fn(),
  upsert: vi.fn(),
  enable: vi.fn(),
  remove: vi.fn(),
  preview: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: (namespace: "Common.errors") =>
    Promise.resolve(createTranslator({ locale: "en", messages, namespace })),
}));
vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/di", () => ({
  ...createMockDiModule(() => mockUser),
  getGetAutomationRulesInteractor: () => ({ invoke: spies.list }),
  getGetAutomationRuleInteractor: () => ({ invoke: spies.get }),
  getGetAutomationRuleRunsInteractor: () => ({ invoke: spies.runs }),
  getUpsertAutomationRuleInteractor: () => ({ invoke: spies.upsert }),
  getSetAutomationRuleEnabledInteractor: () => ({ invoke: spies.enable }),
  getDeleteAutomationRuleInteractor: () => ({ invoke: spies.remove }),
  getPreviewAutomationRuleInteractor: () => ({ invoke: spies.preview }),
}));

import { decode } from "@toon-format/toon";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { createZodError } from "@/core/validation/validation.utils";
import { ALL_MCP_TOOLS } from "../tool-registry";
import { manageRulesTool } from "../rule.mcp-tools";
import { mcpToolResultText } from "../mcp-tool";

const RULE = "00000000-0000-4000-8000-0000000000a1";
const TYPE = "11111111-1111-4111-8111-111111111111";
const FIELD = "22222222-2222-4222-8222-222222222222";

type Params = z.input<typeof manageRulesTool.inputSchema>;

function run(params: Record<string, unknown>) {
  const parsed = manageRulesTool.inputSchema.parse(params) as Parameters<typeof manageRulesTool.execute>[0];
  return manageRulesTool.execute(parsed);
}

function structured(result: Awaited<ReturnType<typeof run>>) {
  if (typeof result === "string" || !("structuredContent" in result)) throw new Error("expected a structured result");
  return result.structuredContent;
}

const rule = {
  id: RULE,
  name: "Remind me",
  enabled: true,
  disabledReason: null,
  owner: { id: "u", firstName: "Ada", lastName: "Lovelace", avatarUrl: null, status: "active" },
  trigger: { kind: "recordCreated", typeId: TYPE },
  conditions: [],
  effects: [{ kind: "notify", recipients: { ruleOwner: true, assignees: false, userIds: [] }, title: "x" }],
  lastRunAt: null,
  lastRunStatus: null,
};

const notify = { kind: "notify", recipients: { ruleOwner: true }, title: "Closing {{record.name}}" };
const trigger = { kind: "recordCreated", typeId: TYPE };

describe("manage_rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is part of the routines toolset and stays available on self-hosted instances", async () => {
    expect(ALL_MCP_TOOLS.map((tool) => tool.name)).toContain("manage_rules");
    const { MCP_TOOL_GROUPS, mcpToolGroupsForAppMode } = await import("../tool-registry");
    expect(MCP_TOOL_GROUPS.routines).toContain(manageRulesTool);
    expect(mcpToolGroupsForAppMode("self-hosted").routines).toEqual([manageRulesTool]);
    expect(mcpToolGroupsForAppMode("cloud").routines).toHaveLength(2);
  });

  it("lists compact summaries, passing the filters and page along", async () => {
    spies.list.mockResolvedValue({ ok: true, data: { items: [rule], total: 1 } });
    const result = await run({ action: "list", typeId: TYPE, owner: "mine", pageSize: 10 });
    expect(spies.list).toHaveBeenCalledWith({ typeId: TYPE, owner: "mine", page: 1, pageSize: 10 });
    expect(structured(result)).toMatchObject({
      total: 1,
      page: 1,
      pageSize: 10,
      items: [{ id: RULE, name: "Remind me", owner: "Ada Lovelace", effects: ["notify"] }],
    });
    expect(decode(mcpToolResultText(result))).toMatchObject({ total: 1 });
  });

  it("creates a live rule from name, trigger and effects only", async () => {
    spies.upsert.mockResolvedValue({ ok: true, data: rule });
    const result = await run({ action: "create", name: "Remind me", trigger, effects: [notify] });
    expect(spies.upsert).toHaveBeenCalledWith({
      name: "Remind me",
      trigger,
      conditions: undefined,
      effects: [expect.objectContaining({ kind: "notify", notificationKind: "ruleAlert" })],
      enabled: undefined,
    });
    expect(structured(result)).toMatchObject({ id: RULE, name: "Remind me", enabled: true });
  });

  it("refuses a create that lacks the required keys without calling the interactor", async () => {
    const result = await run({ action: "create", name: "Remind me" });
    expect(typeof result === "string" ? result : result.text).toContain("create needs name, trigger and effects");
    expect(spies.upsert).not.toHaveBeenCalled();
  });

  it("updates only what was passed, including the id", async () => {
    spies.upsert.mockResolvedValue({ ok: true, data: { ...rule, enabled: false } });
    await run({ action: "update", id: RULE, enabled: false });
    expect(spies.upsert).toHaveBeenCalledWith({
      id: RULE,
      name: undefined,
      trigger: undefined,
      conditions: undefined,
      effects: undefined,
      enabled: false,
    });
  });

  it("switches rules on and off, reads one, shows runs and deletes", async () => {
    spies.enable.mockResolvedValue({ ok: true, data: { ...rule, enabled: false, disabledReason: "disabledByUser" } });
    expect(structured(await run({ action: "disable", id: RULE }))).toMatchObject({ enabled: false, disabledReason: "disabledByUser" });
    expect(spies.enable).toHaveBeenLastCalledWith({ id: RULE, enabled: false });
    spies.enable.mockResolvedValue({ ok: true, data: rule });
    await run({ action: "enable", id: RULE });
    expect(spies.enable).toHaveBeenLastCalledWith({ id: RULE, enabled: true });

    spies.get.mockResolvedValue({ ok: true, data: rule });
    expect(structured(await run({ action: "get", id: RULE }))).toMatchObject({ id: RULE, effects: expect.any(Array) });

    spies.runs.mockResolvedValue({ ok: true, data: { items: [{ id: "r1" }], total: 1 } });
    expect(structured(await run({ action: "runs", id: RULE, pageSize: 5 }))).toMatchObject({ total: 1, pageSize: 5 });
    expect(spies.runs).toHaveBeenCalledWith({ id: RULE, page: 1, pageSize: 5 });

    spies.remove.mockResolvedValue({ ok: true, data: { deleted: true, id: RULE } });
    expect(structured(await run({ action: "delete", id: RULE }))).toEqual({ deleted: true, id: RULE });
  });

  it("asks for the id when an action needs one", async () => {
    for (const action of ["get", "runs", "update", "enable", "disable", "delete"]) {
      const result = await run({ action });
      expect(typeof result === "string" ? result : result.text).toContain(`${action} needs id`);
    }
    expect(spies.get).not.toHaveBeenCalled();
    expect(spies.remove).not.toHaveBeenCalled();
  });

  it("previews a saved rule or an inline date rule", async () => {
    spies.preview.mockResolvedValue({ ok: true, data: { supported: true, total: 1, recordIds: [RULE], alreadyFired: 0 } });
    const dateTrigger = { kind: "dateReached", typeId: TYPE, fieldId: FIELD, days: 1, direction: "before" };
    await run({ action: "preview", id: RULE });
    expect(spies.preview).toHaveBeenLastCalledWith({ id: RULE, rule: undefined });
    const inline = await run({ action: "preview", trigger: dateTrigger });
    expect(spies.preview).toHaveBeenLastCalledWith({
      id: undefined,
      rule: { trigger: expect.objectContaining({ kind: "dateReached", atHour: 8, timezone: "UTC" }), conditions: undefined },
    });
    expect(structured(inline)).toMatchObject({ supported: true, total: 1 });
  });

  it("returns the interactor's refusal as a tool failure", async () => {
    spies.upsert.mockResolvedValue({
      ok: false,
      error: createZodError("Your plan includes 3 active automations.", [], {
        error: CustomErrorCode.automationRuleLimitReached,
        kind: "conflict",
        limit: 3,
      }),
    });
    const result = await run({ action: "create", name: "Remind me", trigger, effects: [notify] });
    expect(typeof result === "string" ? result : result.text).toContain("3 active automations");
    expect(typeof result === "string" || !("failure" in result)).toBe(false);
  });

  it("rejects conditions and effects the schema does not know before running anything", () => {
    const bad = (extra: Record<string, unknown>) =>
      manageRulesTool.inputSchema.safeParse({ action: "create", name: "x", trigger, effects: [notify], ...extra }).success;
    expect(bad({})).toBe(true);
    expect(bad({ conditions: [{ fieldId: FIELD, operator: "equals" }] })).toBe(false);
    expect(bad({ effects: [{ kind: "sendEmail" }] })).toBe(false);
    expect(bad({ effects: [] })).toBe(false);
    expect(bad({ trigger: { kind: "dateReached", typeId: TYPE, fieldId: FIELD, days: -1, direction: "before" } })).toBe(false);
  });

  it("documents the keys of each action in its action description", () => {
    const schema = z.toJSONSchema(manageRulesTool.inputSchema, { io: "input", unrepresentable: "any" }) as {
      properties: Record<string, { enum?: string[]; description?: string }>;
    };
    const action = schema.properties.action;
    for (const name of action.enum ?? []) expect(action.description).toContain(name);
    for (const key of ["id", "name", "enabled", "trigger", "conditions", "effects", "typeId", "owner", "page", "pageSize"])
      expect(schema.properties[key]?.description ?? "", key).not.toEqual("");
  });
});

export type { Params };
