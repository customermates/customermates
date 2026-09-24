import { describe, expect, it } from "vitest";

import { ALL_VIEW_KEY, SURFACE } from "@/core/data-view/data-view-keys";
import { SendAgentMessageSchema } from "@/ee/agent-chat/agent-chat.schema";
import de from "@/i18n/locales/de.json";
import en from "@/i18n/locales/en.json";

import { buildBenchmarkAgentMessageRequest, resolveBenchmarkTurnContext } from "../episode";
import { BENCHMARK_CASES, type CaseId } from "../fixtures";

const CLIENT_REQUEST_ID = "10000000-0000-4000-8000-000000000001";
const CONTACT_ID = "20000000-0000-4000-8000-000000000001";

function benchmarkCase(caseId: CaseId) {
  const definition = BENCHMARK_CASES.find((candidate) => candidate.id === caseId);
  if (!definition) throw new Error(`Missing benchmark case ${caseId}.`);
  return definition;
}

function requestFor(caseId: CaseId, fixtureIds: Readonly<Record<string, string>> = {}) {
  const definition = benchmarkCase(caseId);
  const prompt = definition.prompts[0];
  if (!prompt) throw new Error(`Missing first prompt for ${caseId}.`);
  const context = resolveBenchmarkTurnContext(definition, fixtureIds, 0);
  return buildBenchmarkAgentMessageRequest({
    clientRequestId: CLIENT_REQUEST_ID,
    conversationId: null,
    contexts: context.contexts,
    locale: context.locale,
    modelKey: "bench:test",
    pageRoute: context.pageRoute,
    prompt,
  });
}

describe("benchmark structured context requests", () => {
  it("sends the exact current Contacts All appearance context", () => {
    const request = requestFor("V37");

    expect(request.text).toBe(
      `${en.AgentChat.context.starter.appearance}Switch this current Contacts view to the table layout and sort by name descending. Keep every other setting.`,
    );
    expect(request.pageContext.route).toBe(
      `/en/contacts?view=${ALL_VIEW_KEY}&viewSurface=${SURFACE.contacts}&viewAction=update`,
    );
    expect(request.contexts).toEqual([
      {
        label: "View: All",
        reference: {
          kind: "dataView",
          surfaceKey: SURFACE.contacts,
          viewKey: ALL_VIEW_KEY,
          requestedAction: "update",
        },
      },
    ]);
    expect(SendAgentMessageSchema.safeParse(request).success).toBe(true);
  });

  it("sends the named Contacts view-create context", () => {
    const request = requestFor("V40");

    expect(request.text).toBe(
      `${en.AgentChat.context.starter.createNamed.replace("{name}", "Contacts with deals")}Show contacts linked to at least one deal, set the search text to View, group them by creation month, use the card layout, and sort by name ascending.`,
    );
    expect(request.pageContext.route).toBe(
      `/en/contacts?view=${ALL_VIEW_KEY}&viewSurface=${SURFACE.contacts}&viewAction=create`,
    );
    expect(request.contexts).toEqual([
      {
        label: "New view: Contacts with deals",
        reference: {
          kind: "dataView",
          surfaceKey: SURFACE.contacts,
          proposedName: "Contacts with deals",
          requestedAction: "create",
        },
      },
    ]);
    expect(SendAgentMessageSchema.safeParse(request).success).toBe(true);
  });

  it("resolves and sends both the German timeline view and current-record contexts", () => {
    const request = requestFor("V41", { contact: CONTACT_ID });

    expect(request.text).toBe(
      `${de.AgentChat.context.starter.timeline}Zeige nur Datensatzänderungen und sortiere die neuesten Aktivitäten zuerst.`,
    );
    expect(request.locale).toBe("de");
    expect(request.pageContext.route).toBe(
      `/de/contacts/${CONTACT_ID}?view=${ALL_VIEW_KEY}&viewSurface=${SURFACE.entityTimeline}&viewAction=update`,
    );
    expect(request.contexts).toEqual([
      {
        label: "Ansicht: Alle",
        reference: {
          kind: "dataView",
          surfaceKey: SURFACE.entityTimeline,
          viewKey: ALL_VIEW_KEY,
          requestedAction: "update",
        },
      },
      {
        label: "Ada Lovelace",
        reference: {
          kind: "record",
          entityType: "contact",
          recordId: CONTACT_ID,
        },
      },
    ]);
    expect(SendAgentMessageSchema.safeParse(request).success).toBe(true);
  });

  it("fails closed when a configured context references an unknown fixture id", () => {
    expect(() => resolveBenchmarkTurnContext(benchmarkCase("V41"), {}, 0)).toThrow(/unknown fixture id contact/);
  });
});
