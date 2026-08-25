import { describe, expect, it } from "vitest";

import type { AgentModelEntry } from "../model-catalog";

import {
  AGENT_SPEED_KEYS,
  DEFAULT_AGENT_SPEED_KEY,
  MODEL_CATALOG,
  applyAgentModelSpeed,
  resolveAgentModelSpeed,
} from "../model-catalog";

const VERIFIED_PROVIDER_OPTIONS: Record<string, readonly string[]> = {
  openai: ["reasoningEffort"],
};

const catalogEntries: [string, AgentModelEntry][] = Object.entries(MODEL_CATALOG);

describe("agent model speeds", () => {
  it("only sends provider options that were verified to change provider behaviour", () => {
    for (const [key, entry] of catalogEntries) {
      for (const speed of entry.speeds ?? []) {
        for (const [namespace, options] of Object.entries(speed.providerOptions)) {
          expect(namespace, `${key}/${speed.key} targets an unverified provider namespace`).toBe(entry.servingProvider);
          expect(Object.keys(VERIFIED_PROVIDER_OPTIONS), `${key}/${speed.key}`).toContain(namespace);

          for (const option of Object.keys(options))
            expect(VERIFIED_PROVIDER_OPTIONS[namespace], `${key}/${speed.key} sends "${option}"`).toContain(option);
        }
      }
    }
  });

  it("declares speeds only from the shared vocabulary, always including the default", () => {
    for (const [key, entry] of catalogEntries) {
      const speeds = entry.speeds ?? [];
      if (speeds.length === 0) continue;

      for (const speed of speeds) expect(AGENT_SPEED_KEYS, `${key} declares "${speed.key}"`).toContain(speed.key);
      expect(
        speeds.map((speed) => speed.key),
        `${key} omits the default speed`,
      ).toContain(DEFAULT_AGENT_SPEED_KEY);
    }
  });

  it("raises the output envelope as the speed rises, because reasoning bills at the output rate", () => {
    for (const [key, entry] of catalogEntries) {
      const speeds = entry.speeds ?? [];
      if (speeds.length === 0) continue;

      const ordered = AGENT_SPEED_KEYS.map((speedKey) => speeds.find((speed) => speed.key === speedKey)).filter(
        (speed) => speed !== undefined,
      );
      const envelopes = ordered.map((speed) => speed.maxOutputTokens);

      expect(envelopes, `${key} does not widen its envelope with speed`).toEqual(
        [...envelopes].toSorted((a, b) => a - b),
      );
    }
  });

  it("falls back to the default speed for an unknown key and to nothing for a model without speeds", () => {
    const withSpeeds = MODEL_CATALOG.balanced;
    expect(resolveAgentModelSpeed(withSpeeds, "nonsense")?.key).toBe(DEFAULT_AGENT_SPEED_KEY);
    expect(resolveAgentModelSpeed(withSpeeds, null)?.key).toBe(DEFAULT_AGENT_SPEED_KEY);
    expect(resolveAgentModelSpeed(MODEL_CATALOG.expert, "high")).toBeNull();
  });

  it("applies the speed envelope to the model entry without touching anything else", () => {
    const entry = MODEL_CATALOG.balanced;
    const speed = resolveAgentModelSpeed(entry, "high");
    const applied = applyAgentModelSpeed(entry, speed);

    expect(applied.maxOutputTokens).toBe(speed?.maxOutputTokens);
    expect(applied.modelId).toBe(entry.modelId);
    expect(applied.maxContextTokens).toBe(entry.maxContextTokens);
    expect(applyAgentModelSpeed(entry, null)).toEqual(entry);
  });
});
