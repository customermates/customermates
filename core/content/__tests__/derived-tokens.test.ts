import { describe, expect, it } from "vitest";

import {
  WEBHOOK_CURRENT_EVENTS,
  WEBHOOK_EVENT_COUNT,
  WEBHOOK_MESSAGING_EVENTS,
  WEBHOOK_MESSAGING_EVENT_COUNT,
  WEBHOOK_RECORD_EVENTS,
  WEBHOOK_RECORD_EVENT_COUNT,
} from "@/features/webhook/webhook-event-registry";
import { WebhookCurrentEventSchema } from "@/features/webhook/webhook.schema";

import { resolveDerivedTokens, resolveDerivedTokensDeep } from "../derived-tokens";
import { readMcpRegistryFacts } from "../mcp-registry-facts";

describe("derived content tokens", () => {
  it("renders MCP and webhook registry facts", () => {
    const facts = readMcpRegistryFacts();
    expect(resolveDerivedTokens("[[derived.mcp.tools.total]] tools")).toBe(`${facts.total} tools`);
    expect(resolveDerivedTokens("[[derived.mcp.tools.grouped]] grouped")).toBe(`${facts.grouped} grouped`);
    expect(resolveDerivedTokens("[[derived.mcp.tools.alwaysOn]] always-on")).toBe(`${facts.alwaysOn} always-on`);
    expect(resolveDerivedTokens("[[derived.mcp.toolsets.count]] toolsets")).toBe(`${facts.toolsets} toolsets`);
    expect(resolveDerivedTokens("[[derived.mcp.tools.groups.records]] record tools")).toBe(
      `${facts.groups.records} record tools`,
    );
    expect(resolveDerivedTokens("[[derived.mcp.tools.groups.support]] support tools")).toBe(
      `${facts.groups.support} support tools`,
    );
    expect(resolveDerivedTokens("[[derived.webhooks.events.total]] events")).toBe(`${WEBHOOK_EVENT_COUNT} events`);
    expect(resolveDerivedTokens("[[derived.webhooks.events.records]] record events")).toBe(
      `${WEBHOOK_RECORD_EVENT_COUNT} record events`,
    );
    expect(resolveDerivedTokens("[[derived.webhooks.events.messaging]] messaging events")).toBe(
      `${WEBHOOK_MESSAGING_EVENT_COUNT} messaging events`,
    );
  });

  it("counts only the webhook events a webhook can subscribe to", () => {
    expect(WEBHOOK_EVENT_COUNT).toBe(WEBHOOK_CURRENT_EVENTS.length);
    expect(WEBHOOK_RECORD_EVENT_COUNT).toBe(WEBHOOK_RECORD_EVENTS.length);
    expect(WEBHOOK_MESSAGING_EVENT_COUNT).toBe(WEBHOOK_MESSAGING_EVENTS.length);
    expect(WEBHOOK_RECORD_EVENT_COUNT + WEBHOOK_MESSAGING_EVENT_COUNT).toBe(WEBHOOK_EVENT_COUNT);
    expect(WebhookCurrentEventSchema.options).toHaveLength(WEBHOOK_EVENT_COUNT);
    for (const retired of ["contact.created", "deal.updated", "task.deleted"])
      expect(WebhookCurrentEventSchema.safeParse(retired).success).toBe(false);
    expect(resolveDerivedTokens("[[derived.webhooks.events.records]]")).toBe("3");
  });

  it("resolves nested frontmatter and rejects unknown or malformed tokens", () => {
    const facts = readMcpRegistryFacts();
    const publishedAt = new Date("2026-02-12T00:00:00.000Z");
    expect(
      resolveDerivedTokensDeep({
        publishedAt,
        source: "[[derived.mcp.tools.total]] tools",
      }),
    ).toEqual({
      publishedAt,
      source: `${facts.total} tools`,
    });
    expect(() => resolveDerivedTokens("[[derived.mcp.unknown]]")).toThrow("Unknown");
    expect(() => resolveDerivedTokens("[[derived.mcp.tools.total]")).toThrow("Malformed");
  });
});
