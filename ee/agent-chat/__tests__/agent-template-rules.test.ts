import type { RecordModel } from "@/features/records/record-model.schema";
import type { SetupPlan } from "@/features/workspace-setup/setup-plan.schema";
import type { WorkspaceSetupRecord } from "@/ee/workspace-setup/workspace-setup.schema";

import { describe, expect, it, vi } from "vitest";

import { compileTemplate } from "@/core/templates/compile-template";
import { getTemplate, getTemplateText } from "@/core/templates/template-registry";
import { isApprovalFreeActionCall } from "@/ee/agent-chat/gated-tools";
import {
  AgentTemplateRules,
  TEMPLATE_RULES_WINDOW_DAYS,
  renderTemplateRulesBrief,
} from "@/ee/agent-chat/agent-template-rules";
import { buildAgentSystemPrompt } from "@/ee/agent-chat/system-prompt";
import { internalToolIdentity } from "@/ee/agent-chat/tool-identity";
import { UpsertAutomationRuleSchema } from "@/features/automation-rules/automation-rule.schema";

const SLUG = "client-support-desk";
const CONFIRMED_AT = new Date("2026-11-12T10:00:00Z");
const NOW = new Date("2026-11-13T10:00:00Z");

function workspaceOf(plan: SetupPlan) {
  const ids = new Map<string, string>();
  const idOf = (reference: string) => {
    const known = ids.get(reference);
    if (known) return known;
    const created = `00000000-0000-4000-8000-${(ids.size + 1).toString(16).padStart(12, "0")}`;
    ids.set(reference, created);
    return created;
  };
  const lists = plan.recordModel.lists.map((list) => list.key);
  const fields = [...plan.recordModel.fields, ...plan.recordModel.calculations];
  const model = {
    revision: 1,
    types: lists.map((key) => ({ id: idOf(`$list.${key}`), archived: false })),
    fields: [
      ...lists.map((key) => ({ id: idOf(`$list.${key}.name`), archived: false, multiple: false, options: [] })),
      ...fields.map((field) => ({
        id: idOf(`$field.${field.key}`),
        archived: false,
        multiple: false,
        options: "options" in field ? field.options.map((option) => ({ id: option.key })) : [],
      })),
    ],
    relationships: plan.recordModel.relationships.map((relation) => ({
      id: idOf(`$rel.${relation.key}`),
      archived: false,
    })),
  } as unknown as RecordModel;
  return { model, references: [...ids.entries()].map(([reference, id]) => ({ reference, id })) };
}

function setupOf(overrides: Partial<Record<keyof WorkspaceSetupRecord, unknown>> = {}) {
  const { plan } = compileTemplate(getTemplate(SLUG), getTemplateText(SLUG, "en"));
  const { model, references } = workspaceOf(plan);
  const setup = {
    id: "setup-1",
    status: "completed",
    answers: { language: { source: "user", confidence: 1, value: { format: "singleChoice", value: "en" } } },
    interview: { templateSlug: SLUG },
    plan,
    phases: { dataModel: { status: "completed" } },
    created: { references },
    confirmedAt: CONFIRMED_AT,
    startedAt: CONFIRMED_AT,
    ...overrides,
  } as unknown as WorkspaceSetupRecord;
  return { setup, model };
}

function serviceFor(
  overrides: Partial<Record<keyof WorkspaceSetupRecord, unknown>> | null = {},
  rules: { ok: boolean; names?: string[] } = { ok: true },
  now = NOW,
) {
  const { setup, model } = setupOf(overrides ?? {});
  const names = rules.names ?? [];
  const invoke = vi
    .fn()
    .mockResolvedValue(
      rules.ok
        ? { ok: true, data: { items: names.map((name) => ({ name })), total: names.length } }
        : { ok: false, error: { code: "forbidden" } },
    );
  const service = new AgentTemplateRules(
    { findCurrent: () => Promise.resolve(overrides === null ? null : setup) },
    { getModel: () => Promise.resolve(model) },
    { invoke } as never,
    () => now,
  );
  return { service, invoke };
}

function readyRules(brief: string) {
  const line = brief.split("\n").find((entry) => entry.startsWith("Ready rules (JSON): "));
  return JSON.parse(line?.slice("Ready rules (JSON): ".length) ?? "[]") as Array<{
    name: string;
    notes: string[];
    input: unknown;
  }>;
}

describe("AgentTemplateRules", () => {
  it("briefs Mate with the template's rules as ready manage_rules inputs and the skipped ones with their reason", async () => {
    const brief = await serviceFor().service.brief();
    expect(brief).toContain('built from the template "');
    expect(brief).toContain("manage_rules with action create");
    expect(brief).toContain("Create nothing before the user agrees");
    const ready = readyRules(brief ?? "");
    expect(ready.length).toBeGreaterThan(0);
    for (const rule of ready) expect(UpsertAutomationRuleSchema.safeParse(rule.input).success).toBe(true);
    expect(ready.some((rule) => rule.notes.length > 0)).toBe(true);
    expect(brief).toContain("stayed unchanged");
    expect(brief).toContain("manage_routines with enabled false");
  });

  it("leaves out a rule the owner already has", async () => {
    const all = readyRules((await serviceFor().service.brief()) ?? "");
    const withOne = await serviceFor({}, { ok: true, names: [all[0].name] }).service.brief();
    expect(readyRules(withOne ?? "").map((rule) => rule.name)).toEqual(all.slice(1).map((rule) => rule.name));
    expect(await serviceFor({}, { ok: true, names: all.map((rule) => rule.name) }).service.brief()).toBeNull();
  });

  it("says nothing without a template, an unfinished list build, a stale setup or rule access", async () => {
    expect(await serviceFor(null).service.brief()).toBeNull();
    expect(await serviceFor({ interview: { templateSlug: null } }).service.brief()).toBeNull();
    expect(await serviceFor({ interview: { templateSlug: "not-a-template" } }).service.brief()).toBeNull();
    expect(await serviceFor({ plan: null }).service.brief()).toBeNull();
    expect(await serviceFor({ phases: { dataModel: { status: "running" } } }).service.brief()).toBeNull();
    expect(await serviceFor({ phases: {} }).service.brief()).toBeNull();
    expect(await serviceFor({ created: { references: [] } }).service.brief()).toBeNull();
    const stale = new Date(CONFIRMED_AT.getTime() + (TEMPLATE_RULES_WINDOW_DAYS + 1) * 24 * 60 * 60 * 1000);
    expect(await serviceFor({}, { ok: true }, stale).service.brief()).toBeNull();
    const denied = serviceFor({}, { ok: false });
    expect(await denied.service.brief()).toBeNull();
  });

  it("proposes nothing when no rule can be created", () => {
    expect(
      renderTemplateRulesBrief("Client tracker", { ready: [], skipped: [{ key: "a", name: "A", reason: "r" }] }),
    ).toBe(null);
  });
});

describe("the template rules in Mate's prompt and approval policy", () => {
  const base = { userName: "Ada", locale: "en", surface: "chat" } as const;

  it("adds the brief to the chat prompt only", () => {
    const brief = 'Template rules: this workspace was built from the template "Client tracker".';
    expect(buildAgentSystemPrompt({ ...base, templateRules: brief })).toContain(brief);
    expect(buildAgentSystemPrompt({ ...base, surface: "routine", templateRules: brief })).not.toContain(brief);
    expect(buildAgentSystemPrompt(base)).not.toContain("Template rules:");
  });

  it("creates rules only after the owner approves each call", () => {
    const manageRules = internalToolIdentity("manage_rules");
    expect(isApprovalFreeActionCall(manageRules, { action: "create", name: "A" })).toBe(false);
    expect(isApprovalFreeActionCall(manageRules, { action: "update", id: "x" })).toBe(false);
    expect(isApprovalFreeActionCall(manageRules, { action: "enable", id: "x" })).toBe(false);
    expect(isApprovalFreeActionCall(manageRules, { action: "list" })).toBe(true);
  });
});
