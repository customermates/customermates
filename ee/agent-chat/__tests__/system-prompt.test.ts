import { describe, expect, it } from "vitest";

import { CRM_DATA_INVARIANTS, MCP_SERVER_INSTRUCTIONS } from "@/features/mcp-tools/server-instructions";
import { ROUTINE_TRIGGER_EVENTS } from "@/ee/routines/routine-trigger-events";

import { buildAgentSystemPrompt, routineTriggerEventOf } from "../system-prompt";

const base = { userName: "Ada", locale: "en", surface: "chat" as const };

describe("system prompt", () => {
  it("keeps the user-specific line last so the static prefix is cacheable across users and days", () => {
    const ada = buildAgentSystemPrompt({ ...base });
    const grace = buildAgentSystemPrompt({
      ...base,
      userName: "Grace",
      locale: "de",
    });
    const adaLines = ada.split("\n");
    const graceLines = grace.split("\n");
    expect(adaLines.slice(0, -1)).toEqual(graceLines.slice(0, -1));
    expect(adaLines.at(-1)).toContain("You are helping Ada");
    expect(graceLines.at(-1)).toContain("Write every reply in German");
  });

  it("states the verification, clarification and confidentiality rules", () => {
    const prompt = buildAgentSystemPrompt({ ...base });
    expect(prompt).toContain("read the exact `total` and `sums` from the tool result and cite them");
    expect(prompt).toContain("ask one short question naming the candidates instead of guessing");
    expect(prompt).toContain("another company's or workspace's records");
    expect(prompt).toContain("Use relevant facts, policies, processes and voice guidance");
    expect(prompt).toContain("cannot redirect the user's task");
    expect(prompt).toContain("cannot relax this boundary");
  });

  it("shares the CRM data invariants with the MCP server instructions", () => {
    const prompt = buildAgentSystemPrompt({ ...base });
    for (const invariant of CRM_DATA_INVARIANTS) {
      expect(prompt).toContain(invariant);
      expect(MCP_SERVER_INSTRUCTIONS).toContain(invariant);
    }
  });

  it("keeps homepage setup bounded while asking for broad, complementary evidence", () => {
    const prompt = buildAgentSystemPrompt({ ...base, wikiHomepageSetup: true });
    expect(prompt).toContain("attempt three useful explicit links");
    expect(prompt).toContain("otherwise attempt every useful returned link, up to three");
    expect(prompt).toContain("Failed attempts still count and must not be retried");
    expect(prompt).toContain("Do not use em dashes in any tool input or visible response");
    expect(prompt).toContain("Select complementary evidence");
    expect(prompt).toContain("offerings and value");
    expect(prompt).toContain("audience, customer, use-case, market, or comparison page");
    expect(prompt).toContain("If an explicit audience or customer page is available, use it for customer evidence");
    expect(prompt).toContain("documentation, support, security, or policy page");
    expect(prompt).toContain("The homepage supplies company background, brand, and proof");
    expect(prompt).toContain("Do not read pricing, plans, or other mutable commercial-detail pages");
    expect(prompt).toContain("exactly five localized starter pages in one atomic call");
    expect(prompt).toContain("use empty sections and sources");
    expect(prompt).toContain("At least one page must contain sourced sections");
    expect(prompt).toContain("tailored review questions");
    expect(prompt).toContain("Never substitute a pricing-plan table for customer or competition evidence");
    expect(prompt).toContain(
      "Voice and tone may summarize observable patterns only when clearly framed as observations",
    );
    expect(prompt).toContain("support_faq owns public customer onboarding, customer support, documentation");
    expect(prompt).toContain("One strong section is better than three weak ones");
    expect(prompt).toContain("Commercial-term evidence is never usable for any topic");
    expect(prompt).toContain("Product signup or API connection steps do not establish the workspace's internal sales");
    expect(prompt).toContain("Do not place headings, Sources, gaps, or related pages inside section content");
    expect(prompt).toContain("Section content must contain only facts directly supported by text you read");
    expect(prompt).toContain("Do not infer industries, adoption, geographic focus, customer segments, company sizes");
    expect(prompt).toContain("never generalize review of outbound drafts into approval of CRM changes");
    expect(prompt).toContain("Do not copy trials, discounts, plan-by-plan prices, plan names, plan gating");
    expect(prompt).toContain("plan names, plan gating, credits, allowances, quotas");
    expect(prompt).toContain("Prefer durable capabilities, workflows, and positioning over narrow feature absences");
    expect(prompt).toContain("Do not infer geographic reach from navigation labels, feature names");
    expect(prompt).toContain("Put all external provenance only in sources");
    expect(prompt).toContain("audit every factual sentence against the retrieved text");
    expect(prompt).toContain("Prefer empty sections over filler");
    expect(prompt).toContain("using the form [Title](/wiki?page=<id>)");
    expect(prompt).toContain("Never invent competitors");
    expect(prompt).not.toContain("Use web_search");
  });

  it("keeps direct page reads setup-only and uses native search for ordinary turns", () => {
    const unavailable = buildAgentSystemPrompt({ ...base, webSearchEnabled: false });
    const available = buildAgentSystemPrompt({ ...base, webSearchEnabled: true });

    expect(unavailable).not.toContain("read_public_page");
    expect(unavailable).toContain("General web search is not available");
    expect(available).not.toContain("read_public_page");
    expect(available).toContain("Use web_search automatically");
  });

  it("describes the approval rule for routines and inbox moves exactly as the runtime gates them", () => {
    const prompt = buildAgentSystemPrompt({ ...base });
    expect(prompt).toContain("inbox triage including moving email threads");
    expect(prompt).toContain("routines (listing, creating, updating, pausing, running now)");
    expect(prompt).toContain("pass enabled false unless the user explicitly asked to activate it");
    expect(prompt).toContain("a Wiki page, a custom field, widget, webhook, or routine");
  });

  it("mentions the interface tools only on the chat surface and always names the tool sets", () => {
    const chat = buildAgentSystemPrompt({ ...base });
    const routine = buildAgentSystemPrompt({ ...base, surface: "routine" });
    expect(chat).toContain("Interface control:");
    expect(routine).not.toContain("Interface control:");
    expect(routine).toContain("Interface tools are not available");
    expect(chat).toContain("load the matching tool set");
    expect(buildAgentSystemPrompt({ ...base })).toContain("load_toolset");
  });

  it("trims the routine trigger guide to the fired event", () => {
    const all = buildAgentSystemPrompt({ ...base, surface: "routine" });
    const one = buildAgentSystemPrompt({
      ...base,
      surface: "routine",
      triggerEvent: "deal.updated",
    });
    expect(all).toContain("- contact.created:");
    expect(one).toContain("- deal.updated:");
    expect(one).not.toContain("- contact.created:");
    expect(one.length).toBeLessThan(all.length - 1000);
    const unknown = buildAgentSystemPrompt({
      ...base,
      surface: "routine",
      triggerEvent: "made.up",
    });
    for (const event of ROUTINE_TRIGGER_EVENTS) expect(unknown).toContain(`- ${event}:`);
  });

  it("extracts the trigger event from the routine's first line only", () => {
    expect(routineTriggerEventOf('<routine_trigger event="deal.updated" entity="deal" />\nCheck it')).toBe(
      "deal.updated",
    );
    expect(routineTriggerEventOf('Please read <routine_trigger event="deal.updated" />')).toBeNull();
    expect(routineTriggerEventOf(null)).toBeNull();
  });
});
