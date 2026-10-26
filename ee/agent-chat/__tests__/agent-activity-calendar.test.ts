import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ROUTING_LOCALES } from "@/i18n/locale-registry";

import { agentActivityCopy, describeAgentTool } from "../agent-activity";
import { ALL_MCP_TOOLS } from "@/features/mcp-tools/tool-registry";

import { requiresApproval } from "../gated-tools";
import { internalToolIdentity } from "../tool-identity";

const describeInternalTool = (name: string, input: unknown) => describeAgentTool(internalToolIdentity(name), input);
const manageCalendarTool = ALL_MCP_TOOLS.find((tool) => tool.name === "manage_calendar");

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

describe("manage_calendar activity", () => {
  if (!manageCalendarTool) throw new Error("manage_calendar is not registered");

  it("reads and changes the calendar without approval and asks before revoking a subscription URL", () => {
    for (const action of ["options", "read", "subscriptions"]) {
      expect(describeInternalTool("manage_calendar", { action })).toMatchObject({ kind: "views.read", risk: "read" });
      expect(requiresApproval(internalToolIdentity("manage_calendar"), manageCalendarTool, { action })).toBe(false);
    }
    for (const input of [{ action: "update", config: { mode: "week" } }, { action: "reset" }]) {
      expect(describeInternalTool("manage_calendar", input)).toMatchObject({ kind: "views.configure", risk: "write" });
      expect(requiresApproval(internalToolIdentity("manage_calendar"), manageCalendarTool, input)).toBe(false);
    }
    const revoke = { action: "revoke", id: "secret-id" };
    expect(describeInternalTool("manage_calendar", revoke)).toMatchObject({
      kind: "generic",
      risk: "sensitive",
      consequence: { action: "calendarSubscription.revoke" },
    });
    expect(JSON.stringify(describeInternalTool("manage_calendar", revoke))).not.toContain("secret-id");
    expect(requiresApproval(internalToolIdentity("manage_calendar"), manageCalendarTool, revoke)).toBe(true);
  });

  it("explains the revoke in every content locale", () => {
    for (const locale of ROUTING_LOCALES) {
      const copy = agentActivityCopy(
        describeInternalTool("manage_calendar", { action: "revoke", id: "x" }),
        translatorFor(locale),
      );
      expect(copy.approval, locale).not.toBe(copy.running);
      expect(copy.detail, locale).toBe(
        translatorFor(locale)("AgentChat.activity.consequence.calendarSubscriptionRevoke"),
      );
    }
  });
});
