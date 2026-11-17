import { describe, expect, it, vi } from "vitest";

import type { PlanId } from "@/core/commercial/plan-catalog";
import type { AppMode } from "@/core/config/environment";

import { AgentOwnKeyPlan } from "@/ee/agent-keys/agent-own-key-plan";
import { AgentRuntimeAvailabilitySchema } from "@/features/automation-rules/agent-runtime-availability";
import { AGENT_RUNNER_LIMITS } from "@/features/agent-runners/agent-runner.schema";
import { AgentRuntimeAvailabilityAdapter } from "../agent-runtime-availability-source";

const NOW = new Date("2026-11-17T12:00:00.000Z");
const RUNNER_A = "00000000-0000-4000-8000-0000000000c1";
const RUNNER_B = "00000000-0000-4000-8000-0000000000c2";

type Options = {
  appMode?: AppMode;
  chatEnabled?: boolean;
  plan?: PlanId | null;
  keys?: Array<{ provider: "anthropic" | "openai" | "google"; defaultModel?: string | null }>;
  runners?: Array<{
    id: string;
    name: string;
    lastSeenAt: Date | null;
    createdById?: string;
    clients?: unknown[];
    revokedAt?: Date | null;
  }>;
};

const ME = "00000000-0000-4000-8000-0000000000a1";
const COLLEAGUE = "00000000-0000-4000-8000-0000000000a2";
const CLIENTS = [{ name: "claude", version: "2.1.326" }];

const withMachine = (runners: NonNullable<Options["runners"]>) =>
  runners.map((runner) => ({
    machine: null,
    clients: runner.lastSeenAt ? CLIENTS : [],
    revokedAt: null,
    createdById: ME,
    createdAt: runner.lastSeenAt ?? new Date(0),
    ...runner,
  }));

function adapter(options: Options = {}) {
  const plans = { plan: () => Promise.resolve({ plan: options.plan === undefined ? ("pro" as const) : options.plan }) };
  return new AgentRuntimeAvailabilityAdapter(
    options.appMode ?? "cloud",
    () => options.chatEnabled ?? true,
    plans,
    new AgentOwnKeyPlan(plans),
    { findAll: vi.fn().mockResolvedValue(options.keys ?? []) },
    { listRunners: vi.fn().mockResolvedValue(withMachine(options.runners ?? [])) },
    () => ME,
    () => NOW,
  );
}

describe("agent runtime availability", () => {
  it("offers Mate on Cloud with the hosted agent entitlement and says why it does not elsewhere", async () => {
    expect((await adapter().availability()).mate).toEqual({ available: true, reason: null, models: [], runners: [] });
    expect((await adapter({ appMode: "self-hosted", plan: null }).availability()).mate.reason).toBe("selfHosted");
    expect((await adapter({ plan: "free" }).availability()).mate.reason).toBe("plan");
    expect((await adapter({ chatEnabled: false }).availability()).mate.reason).toBe("notConfigured");
    expect((await adapter({ plan: "starter" }).availability()).mate.available).toBe(true);
  });

  it("offers an own key once the plan allows it and a key exists, and lists the models of the key's provider", async () => {
    const noKey = await adapter({ keys: [] }).availability();
    expect(noKey.ownKey).toEqual({ available: false, reason: "noKey", models: [], runners: [] });

    const free = await adapter({ plan: "free", keys: [{ provider: "anthropic" }] }).availability();
    expect(free.ownKey.reason).toBe("plan");

    const anthropic = await adapter({ keys: [{ provider: "anthropic" }] }).availability();
    expect(anthropic.ownKey).toMatchObject({ available: true, reason: null });
    expect(anthropic.ownKey.models.map((model) => model.id)).toContain("claude-sonnet-5-5");
    expect(anthropic.ownKey.models.map((model) => model.id)).not.toContain("gpt-5");

    const both = await adapter({ keys: [{ provider: "anthropic" }, { provider: "openai" }] }).availability();
    expect(both.ownKey.models.map((model) => model.id)).toEqual(
      expect.arrayContaining(["claude-sonnet-5-5", "gpt-5", "gpt-5-mini"]),
    );
  });

  it("names the model a step without one is saved with, and none when the workspace has several keys", async () => {
    const saved = await adapter({ keys: [{ provider: "openai", defaultModel: "gpt-5" }] }).availability();
    expect(saved.ownKey.defaultModel).toBe("gpt-5");

    const retired = await adapter({ keys: [{ provider: "openai", defaultModel: "gpt-3" }] }).availability();
    expect(retired.ownKey.defaultModel).toBe("gpt-5-mini");

    const unset = await adapter({ keys: [{ provider: "anthropic" }] }).availability();
    expect(unset.ownKey.defaultModel).toBe("claude-sonnet-5-5");

    const both = await adapter({ keys: [{ provider: "anthropic" }, { provider: "openai" }] }).availability();
    expect(both.ownKey).toMatchObject({ available: true, defaultModel: null });

    expect((await adapter({ keys: [] }).availability()).ownKey.defaultModel).toBeUndefined();
    expect(AgentRuntimeAvailabilitySchema.parse(both).ownKey.defaultModel).toBeNull();
  });

  it("keeps own keys open on an install without a plan, where the key is the customer's own", async () => {
    const selfHosted = await adapter({
      appMode: "self-hosted",
      plan: null,
      keys: [{ provider: "openai" }],
    }).availability();
    expect(selfHosted.ownKey.available).toBe(true);
    expect(selfHosted.mate.available).toBe(false);
  });

  it("counts a runner as online for two minutes after it was last seen and never a revoked one", async () => {
    const fresh = new Date(NOW.getTime() - AGENT_RUNNER_LIMITS.onlineWithinMs + 1000);
    const stale = new Date(NOW.getTime() - AGENT_RUNNER_LIMITS.onlineWithinMs - 1000);

    const online = await adapter({
      runners: [
        { id: RUNNER_A, name: "ws-main", lastSeenAt: fresh },
        { id: RUNNER_B, name: "laptop", lastSeenAt: stale },
      ],
    }).availability();
    expect(online.runner).toEqual({
      available: true,
      reason: null,
      models: [],
      runners: [
        { id: RUNNER_A, name: "ws-main", online: true },
        { id: RUNNER_B, name: "laptop", online: false },
      ],
    });

    const offline = await adapter({ runners: [{ id: RUNNER_B, name: "laptop", lastSeenAt: stale }] }).availability();
    expect(offline.runner).toEqual({
      available: true,
      reason: null,
      models: [],
      runners: [{ id: RUNNER_B, name: "laptop", online: false }],
    });

    const never = await adapter({ runners: [{ id: RUNNER_B, name: "new", lastSeenAt: null }] }).availability();
    expect(never.runner.reason).toBe("noRunner");
    expect((await adapter().availability()).runner).toEqual({
      available: false,
      reason: "noRunner",
      models: [],
      runners: [],
    });
  });

  it("offers a member only their own runners, and none that is revoked or has no command line client", async () => {
    const answer = await adapter({
      runners: [
        { id: RUNNER_A, name: "colleague", lastSeenAt: NOW, createdById: COLLEAGUE },
        { id: RUNNER_B, name: "revoked", lastSeenAt: NOW, revokedAt: NOW },
      ],
    }).availability();
    expect(answer.runner).toEqual({ available: false, reason: "noRunner", models: [], runners: [] });

    const withoutClient = await adapter({
      runners: [{ id: RUNNER_A, name: "bare", lastSeenAt: NOW, clients: [] }],
    }).availability();
    expect(withoutClient.runner).toEqual({
      available: false,
      reason: "noRunner",
      models: [],
      runners: [{ id: RUNNER_A, name: "bare", online: false }],
    });
  });

  it("answers in the shape the builder reads", async () => {
    const answer = await adapter({
      keys: [{ provider: "google" }],
      runners: [{ id: RUNNER_A, name: "r", lastSeenAt: NOW }],
    }).availability();
    expect(AgentRuntimeAvailabilitySchema.parse(answer)).toEqual(answer);
  });
});
