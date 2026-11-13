import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ROUTING_LOCALES } from "@/i18n/locale-registry";

import { AGENT_APPROVAL_COPY_KINDS, agentActivityCopy, describeAgentTool } from "../agent-activity";
import { requiresApproval } from "../gated-tools";
import { internalToolIdentity } from "../tool-identity";
import { ALL_MCP_TOOLS } from "@/features/mcp-tools/tool-registry";

const describeInternalTool = (name: string, input: unknown) => describeAgentTool(internalToolIdentity(name), input);

function translatorFor(locale: string) {
  const messages = JSON.parse(readFileSync(join(process.cwd(), "i18n", "locales", `${locale}.json`), "utf8")) as Record<
    string,
    unknown
  >;
  return (key: string, values: Record<string, string | number> = {}) => {
    const value = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], messages);
    if (typeof value !== "string") throw new Error(`missing ${locale} message ${key}`);
    return value.replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
  };
}

const TITLE = "Chase the client for the open item";
const CREATE = {
  action: "create",
  name: TITLE,
  trigger: { kind: "fieldChanged", typeId: "t-1", fieldId: "f-1" },
  conditions: [],
  effects: [
    {
      kind: "createRecord",
      typeId: "t-2",
      title: { fieldId: "f-2", text: `${TITLE}: {{record.name}}` },
      due: { fieldId: "f-3", offsetDays: 7 },
    },
  ],
};

describe("manage_rules activity", () => {
  it("names the rule, when it fires and what it does for a rule that is created", () => {
    expect(describeInternalTool("manage_rules", CREATE)).toMatchObject({
      kind: "rules.create",
      risk: "sensitive",
      context: { labels: [TITLE] },
      consequence: {
        action: "rule.create",
        rule: { trigger: "fieldChanged", effects: [{ kind: "createRecord", title: TITLE }], live: true },
      },
    });
  });

  it("says whether the rule goes live at once or is saved as a draft, and reads a notification title", () => {
    const notify = { kind: "notify", title: "An Action is overdue", recipients: { ruleOwner: true } };
    const draft = describeInternalTool("manage_rules", {
      ...CREATE,
      enabled: false,
      effects: [notify],
      trigger: { kind: "dateReached" },
    });
    expect(draft.consequence?.rule).toEqual({
      trigger: "dateReached",
      effects: [{ kind: "notify", title: "An Action is overdue" }],
      live: false,
    });
  });

  it("keeps what an update changes and leaves out what an update does not mention", () => {
    expect(describeInternalTool("manage_rules", { action: "update", id: "x", name: "New name" })).toMatchObject({
      kind: "rules.manage",
      risk: "sensitive",
      context: { labels: ["New name"] },
      consequence: { action: "rule.update", rule: { effects: [] } },
    });
    const switchedOff = describeInternalTool("manage_rules", { action: "update", id: "x", enabled: false });
    expect(switchedOff.consequence?.rule).toEqual({ effects: [], live: false });
  });

  it("gives enabling, disabling and deleting their own consequence without leaking the id", () => {
    for (const [action, consequence] of [
      ["enable", "rule.enable"],
      ["disable", "rule.disable"],
      ["delete", "rule.delete"],
    ] as const) {
      const activity = describeInternalTool("manage_rules", { action, id: "secret-id" });
      expect(activity).toMatchObject({ kind: "rules.manage", risk: "sensitive", consequence: { action: consequence } });
      expect(JSON.stringify(activity)).not.toContain("secret-id");
    }
  });

  it("treats reading rules as a read and ignores trigger and effect kinds it does not know", () => {
    for (const action of ["list", "get", "runs", "preview"])
      expect(describeInternalTool("manage_rules", { action, id: "x" })).toMatchObject({
        kind: "workspace.read",
        risk: "read",
      });
    const odd = describeInternalTool("manage_rules", {
      action: "create",
      name: "Odd",
      trigger: { kind: "somethingNew" },
      effects: [{ kind: "teleport" }, { kind: "setField" }, "nonsense"],
    });
    expect(odd.consequence?.rule).toEqual({ effects: [{ kind: "setField" }], live: true });
  });

  it("raises an approval card for every action that changes a rule", () => {
    const tool = ALL_MCP_TOOLS.find((candidate) => candidate.name === "manage_rules");
    expect(tool).toBeDefined();
    for (const action of ["create", "update", "enable", "disable", "delete"]) {
      const input = { action, id: "x" };
      expect(requiresApproval(internalToolIdentity("manage_rules"), tool as never, input)).toBe(true);
      expect(AGENT_APPROVAL_COPY_KINDS).toContain(describeInternalTool("manage_rules", input).kind);
    }
  });

  it.each(ROUTING_LOCALES)("shows the rule and its when and then in %s", (locale) => {
    const t = translatorFor(locale);
    const copy = agentActivityCopy(describeInternalTool("manage_rules", CREATE), t);

    expect(copy.approval).toContain(t("AgentChat.activity.approval.rules.create"));
    expect(copy.approval).toContain(TITLE);
    expect(copy.detail).toContain(t("AgentChat.activity.rule.trigger.fieldChanged"));
    expect(copy.detail).toContain(TITLE);
    expect(copy.detail).toContain(t("AgentChat.activity.consequence.ruleLive"));
    expect(copy.detail).not.toMatch(/[{}]/);
    expect(copy.running).toBe(`${t("AgentChat.activity.state.rules.create.running")} · ${TITLE}`);
  });

  it("words the rule card differently from English in every other locale", () => {
    const english = translatorFor("en");
    for (const locale of ROUTING_LOCALES.filter((candidate) => candidate !== "en")) {
      const t = translatorFor(locale);
      for (const key of [
        "AgentChat.activity.approval.rules.create",
        "AgentChat.activity.approval.rules.manage",
        "AgentChat.activity.consequence.ruleSummary",
        "AgentChat.activity.rule.trigger.fieldChanged",
        "AgentChat.activity.rule.effect.createRecord",
      ])
        expect(t(key, { title: "T", when: "W", then: "H" }), `${locale} ${key}`).not.toBe(
          english(key, { title: "T", when: "W", then: "H" }),
        );
    }
  });

  it.each(ROUTING_LOCALES)("words every change to a rule in %s with its own approval and result copy", (locale) => {
    const t = translatorFor(locale);
    for (const action of ["update", "enable", "disable", "delete"]) {
      const copy = agentActivityCopy(describeInternalTool("manage_rules", { action, id: "x" }), t);
      expect(copy.approval, `${locale} ${action}`).toBe(t("AgentChat.activity.approval.rules.manage"));
      expect(copy.approval).not.toBe(copy.running);
      expect(copy.done).toBe(t("AgentChat.activity.state.rules.manage.done"));
      expect(copy.error).toBe(t("AgentChat.activity.state.rules.manage.error"));
      expect(copy.detail, `${locale} ${action}`).toBeTruthy();
    }
    const deletion = agentActivityCopy(describeInternalTool("manage_rules", { action: "delete", id: "x" }), t);
    expect(deletion.detail).toBe(t("AgentChat.activity.consequence.ruleDelete"));
  });

  it("builds every trigger and effect phrase of the engine in every locale without leftover placeholders", () => {
    const triggers = [
      "recordCreated",
      "recordUpdated",
      "fieldChanged",
      "dateReached",
      "messageReceived",
      "formSubmitted",
      "webhookReceived",
    ];
    const effects = [
      { kind: "createRecord", title: { text: "A" } },
      { kind: "notify", title: "B" },
      { kind: "setField" },
      { kind: "callWebhook" },
    ];
    for (const locale of ROUTING_LOCALES) {
      const t = translatorFor(locale);
      for (const trigger of triggers) {
        const detail = agentActivityCopy(
          describeInternalTool("manage_rules", { action: "create", name: "R", trigger: { kind: trigger }, effects }),
          t,
        ).detail;
        expect(detail, `${locale} ${trigger}`).toContain(t(`AgentChat.activity.rule.trigger.${trigger}`));
        expect(detail).not.toMatch(/[{}]/);
        expect(detail?.split(", ").length).toBeGreaterThanOrEqual(4);
      }
    }
  });
});
