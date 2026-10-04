import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
  getLocale: () => Promise.resolve("en"),
}));

import { ALL_MCP_TOOLS } from "../tool-registry";
import { ROUTINE_TRIGGER_EVENTS } from "@/ee/routines/routine-trigger-events";
import { WEBHOOK_LEGACY_EVENTS } from "@/features/webhook/webhook-event-registry";

describe("manage_routines trigger events", () => {
  const tool = ALL_MCP_TOOLS.find((candidate) => candidate.name === "manage_routines");
  if (!tool) throw new Error("manage_routines is not registered");
  const shape = (tool.inputSchema as unknown as { shape: Record<string, z.ZodType> }).shape;

  it("offers and accepts only events that are still emitted", () => {
    const description = shape.triggerEvents.description ?? "";
    for (const event of ROUTINE_TRIGGER_EVENTS)
      expect(shape.triggerEvents.safeParse([event]).success, event).toBe(true);
    for (const event of WEBHOOK_LEGACY_EVENTS) {
      expect(description).not.toContain(event);
      expect(shape.triggerEvents.safeParse([event]).success, event).toBe(false);
    }
    expect(shape.triggerEvents.safeParse(["record.updated"]).success).toBe(true);
  });

  it("describes watched fields as field IDs of the subscribed record type", () => {
    expect(shape.changedFields.description).toContain("field IDs of the subscribed record type");
    expect(shape.changedFields.description).not.toMatch(/custom-column/);
    expect(shape.recordTrigger.description).not.toMatch(/retired entity events/);
  });
});
