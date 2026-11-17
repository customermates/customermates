import type { AgentRuntimeAvailability } from "./agent-runtime-availability";
import type { AutomationEffect } from "./automation-rule.schema";

import { CustomErrorCode } from "@/core/validation/validation.types";

type AgentEffect = Extract<AutomationEffect, { kind: "agent" }>;

export type StepReferenceIssue = { path: string[]; code: CustomErrorCode; reason: string };

export type StepReferences = {
  runtimes: AgentRuntimeAvailability | null;
  webhookIds: ReadonlySet<string>;
};

export type ResolvedSteps = { ok: true; effects: AutomationEffect[] } | { ok: false; issue: StepReferenceIssue };

export function needsAgentRuntimes(effects: readonly AutomationEffect[]): boolean {
  return effects.some((effect) => effect.kind === "agent" && effect.runtime !== "mate");
}

function ownKeyStep(effect: AgentEffect, runtimes: AgentRuntimeAvailability, path: string[]) {
  const option = runtimes.ownKey;
  if (!option.available) return effect;
  if (effect.model) {
    if (option.models.some((model) => model.id === effect.model)) return effect;
    return {
      path: [...path, "model"],
      code: CustomErrorCode.agentProviderModelInvalid,
      reason: "agentModelUnavailable",
    };
  }
  if (option.defaultModel) return { ...effect, model: option.defaultModel };
  return { path: [...path, "model"], code: CustomErrorCode.mustNotBeBlank, reason: "modelRequired" };
}

function runnerStep(effect: AgentEffect, runtimes: AgentRuntimeAvailability, path: string[]) {
  const option = runtimes.runner;
  if (!effect.runnerId || option.reason === "notConfigured") return effect;
  if (option.runners.some((runner) => runner.id === effect.runnerId)) return effect;
  return {
    path: [...path, "runnerId"],
    code: CustomErrorCode.agentRunnerNotFound,
    reason: "agentRunnerUnavailable",
  };
}

function resolveStep(
  effect: AutomationEffect,
  references: StepReferences,
  path: string[],
): AutomationEffect | StepReferenceIssue {
  if (effect.kind === "callWebhook") {
    if (references.webhookIds.has(effect.webhookId)) return effect;
    return { path: [...path, "webhookId"], code: CustomErrorCode.webhookNotFound, reason: "webhook:missing" };
  }
  if (effect.kind !== "agent" || !references.runtimes) return effect;
  if (effect.runtime === "ownKey") return ownKeyStep(effect, references.runtimes, path);
  if (effect.runtime === "runner") return runnerStep(effect, references.runtimes, path);
  return effect;
}

export function resolveStepReferences(effects: readonly AutomationEffect[], references: StepReferences): ResolvedSteps {
  const resolved: AutomationEffect[] = [];
  for (const [index, effect] of effects.entries()) {
    const step = resolveStep(effect, references, ["effects", String(index)]);
    if ("path" in step) return { ok: false, issue: step };
    resolved.push(step);
  }
  return { ok: true, effects: resolved };
}
