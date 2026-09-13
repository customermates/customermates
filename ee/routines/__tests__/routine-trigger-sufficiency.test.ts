import { describe, expect, it } from "vitest";

import { ALL_MCP_TOOLS } from "@/features/mcp-tools/tool-registry";
import { ROUTINE_TRIGGER_ENTITY_GUIDE, routineTriggerGuide } from "@/ee/routines/routine-trigger-doc";
import { ROUTINE_TRIGGER_EVENTS } from "@/ee/routines/routine.schema";
import { composeRoutinePrompt } from "@/ee/routines/routine-prompt";

const RECORD_PAYLOAD: Record<string, unknown> = {
  created: { id: "entity-1", name: "Acme", firstName: "Ada", lastName: "Lovelace" },
  updated: { changes: { name: {} } },
  deleted: { id: "entity-1", name: "Acme", firstName: "Ada", lastName: "Lovelace" },
};

const MESSAGING_PAYLOAD = {
  connectedAccountId: "account-1",
  provider: "google",
  providerMessageId: "provider-1",
  providerCalendarId: "calendar-1",
  providerEventId: "event-1",
  providerUserId: "user-1",
  threadId: "thread-1",
};

function payloadFor(event: string): Record<string, unknown> {
  if (event.startsWith("messaging.")) return MESSAGING_PAYLOAD;

  const verb = event.split(".").at(-1) ?? "";
  return (RECORD_PAYLOAD[verb] ?? {}) as Record<string, unknown>;
}

function attributesOf(event: string): Record<string, string> {
  const composed = composeRoutinePrompt("Do the work", {
    routineName: "Fixture",
    triggerEvent: event,
    triggerEntityId: "entity-1",
    triggerPayload: { companyId: "company-1", userId: null, entityId: "entity-1", payload: payloadFor(event) },
  });

  const block = composed.slice(0, composed.indexOf("/>"));
  return Object.fromEntries([...block.matchAll(/(\w+)="([^"]*)"/g)].map((match) => [match[1], match[2]]));
}

function toolArgumentNames(name: string): string[] {
  const tool = ALL_MCP_TOOLS.find((candidate) => candidate.name === name);
  const shape = (tool?.inputSchema as { shape?: Record<string, unknown> } | undefined)?.shape ?? {};

  return Object.keys(shape);
}

describe("routine trigger sufficiency", () => {
  it("guides every event a routine may subscribe to", () => {
    expect(ROUTINE_TRIGGER_EVENTS.filter((event) => !ROUTINE_TRIGGER_ENTITY_GUIDE[event])).toEqual([]);
  });

  it("names a tool that exists, with an argument that tool really accepts", () => {
    for (const event of ROUTINE_TRIGGER_EVENTS) {
      const entry = ROUTINE_TRIGGER_ENTITY_GUIDE[event];
      const args = toolArgumentNames(entry.tool);

      expect(args.length, `${event}: ${entry.tool} is not a registered tool`).toBeGreaterThan(0);

      if (!entry.argument) continue;

      const root = entry.argument.split(/[.[ ]/)[0] ?? entry.argument;
      expect(args, `${event}: ${entry.tool} does not accept ${root}`).toContain(root);
    }
  });

  it("hands the agent the identifier each guided lookup needs", () => {
    const missing: string[] = [];

    for (const event of ROUTINE_TRIGGER_EVENTS) {
      const entry = ROUTINE_TRIGGER_ENTITY_GUIDE[event];
      const attributes = attributesOf(event);

      if (entry.argument === "threadId" && !attributes.threadId) missing.push(`${event}: no threadId`);
      if (entry.argument === "id" && !attributes.entityId) missing.push(`${event}: no entityId`);
      if (entry.argument === "eventId" && !attributes.entityId) missing.push(`${event}: no entityId`);
      if (!entry.argument && !attributes.entityId && !attributes.entityName)
        missing.push(`${event}: nothing to match on`);
    }

    expect(missing).toEqual([]);
  });

  it("tells the agent what every attribute it can see means", () => {
    const guide = routineTriggerGuide();

    for (const attribute of [
      "event",
      "entity",
      "entityId",
      "entityName",
      "threadId",
      "changedFields",
      "changedFieldLabels",
      "changedFieldCount",
    ])
      expect(guide, `the guide never explains ${attribute}`).toContain(attribute);
  });
});
