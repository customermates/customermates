import type { AgentRuntimeAvailability } from "@/features/automation-rules/agent-runtime-availability";
import type { AgentRuntimeAvailabilitySource } from "@/features/automation-rules/get-agent-runtime-availability.interactor";
import type { AgentRunnerPresenceRepo } from "@/features/agent-jobs/agent-runner-presence.repo";
import type { PlanId } from "@/core/commercial/plan-catalog";
import type { AppMode } from "@/core/config/environment";
import type { AgentOwnKeyPlan } from "@/ee/agent-keys/agent-own-key-plan";
import type { AgentProviderKeyRepo } from "@/ee/agent-keys/agent-provider-key.repo";

import { PLAN_CATALOG } from "@/core/commercial/plan-catalog";
import { agentProviderModels } from "@/ee/agent-keys/agent-provider-models";

export const AGENT_RUNNER_ONLINE_WINDOW_MS = 2 * 60 * 1000;

type PlanSource = { plan(): Promise<{ plan: PlanId | null }> };

export class AgentRuntimeAvailabilityAdapter implements AgentRuntimeAvailabilitySource {
  constructor(
    private readonly appMode: AppMode,
    private readonly agentChatEnabled: () => boolean,
    private readonly plans: PlanSource,
    private readonly ownKeyPlan: Pick<AgentOwnKeyPlan, "allowed">,
    private readonly keys: Pick<AgentProviderKeyRepo, "findAll">,
    private readonly runners: AgentRunnerPresenceRepo,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async availability(): Promise<AgentRuntimeAvailability> {
    const [mate, ownKey, runner] = await Promise.all([this.mate(), this.ownKey(), this.runner()]);
    return { mate, ownKey, runner };
  }

  private async mate(): Promise<AgentRuntimeAvailability["mate"]> {
    const none = { models: [], runners: [] };
    if (this.appMode === "self-hosted") return { available: false, reason: "selfHosted", ...none };
    if (!this.agentChatEnabled()) return { available: false, reason: "notConfigured", ...none };
    const { plan } = await this.plans.plan();
    if (plan !== null && !PLAN_CATALOG[plan].entitlements.agentChat)
      return { available: false, reason: "plan", ...none };
    return { available: true, reason: null, ...none };
  }

  private async ownKey(): Promise<AgentRuntimeAvailability["ownKey"]> {
    if (!(await this.ownKeyPlan.allowed())) return { available: false, reason: "plan", models: [], runners: [] };
    const keys = await this.keys.findAll();
    if (keys.length === 0) return { available: false, reason: "noKey", models: [], runners: [] };
    const models = keys.flatMap((key) => agentProviderModels(key.provider).map(({ id, label }) => ({ id, label })));
    return { available: true, reason: null, models, runners: [] };
  }

  private async runner(): Promise<AgentRuntimeAvailability["runner"]> {
    const since = this.clock().getTime() - AGENT_RUNNER_ONLINE_WINDOW_MS;
    const runners = (await this.runners.findActive()).map((runner) => ({
      id: runner.id,
      name: runner.name,
      online: runner.lastSeenAt !== null && runner.lastSeenAt.getTime() >= since,
    }));
    const online = runners.some((runner) => runner.online);
    return { available: online, reason: online ? null : "noRunner", models: [], runners };
  }
}
