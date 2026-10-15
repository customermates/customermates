import type { z } from "zod";
import type { AgentRetrievalCharge, AgentUsageService } from "@/ee/agent-chat/agent-usage.service";
import type { AgentModelEntry } from "@/ee/agent-chat/model-catalog";
import type { WorkspaceSetupFailure } from "./workspace-setup.schema";
import type { WorkspaceSetupBudget } from "./workspace-setup-spend";

import { UserAccessor } from "@/core/base/user-accessor";
import { AGENT_MODELS } from "@/ee/agent-chat/model-catalog";
import { generateStructuredObject, structuredCallWorstCaseMicrocents } from "@/ee/agent-chat/structured-model-call";

export type SetupModelOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; failure: WorkspaceSetupFailure; rejection?: string };

export type SetupModelCall<T> = {
  label: string;
  purpose: "setupDrafting" | "setupPlanning";
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
};

export class WorkspaceSetupModelService extends UserAccessor {
  private readonly warnings: string[] = [];

  constructor(
    private usage: Pick<AgentUsageService, "reserveWorkspacePlatform" | "settlePlatformRetrieval">,
    private budget: WorkspaceSetupBudget,
  ) {
    super();
  }

  drainWarnings(): string[] {
    return this.warnings.splice(0);
  }

  async generate<T>(call: SetupModelCall<T>): Promise<SetupModelOutcome<T>> {
    const model: AgentModelEntry = AGENT_MODELS[call.purpose];
    const worstCaseMicrocents = structuredCallWorstCaseMicrocents(model, call.system, call.prompt);
    const reserved = await this.usage.reserveWorkspacePlatform({
      companyId: this.companyId,
      purpose: this.budget.purpose,
      model: model.modelId,
      worstCaseMicrocents,
      capMicrocents: this.budget.capMicrocents,
    });
    if (reserved.status !== "reserved")
      return { ok: false, failure: reserved.status === "cap" ? "spendCap" : "aiUnavailable" };

    let charge: AgentRetrievalCharge | null = {
      model: model.modelId,
      inputTokens: 0,
      costMicrocents: Math.max(1, worstCaseMicrocents),
      costSource: "estimated",
    };
    try {
      const result = await generateStructuredObject({
        label: call.label,
        model,
        schema: call.schema,
        system: call.system,
        prompt: call.prompt,
      });
      charge = result.charge;
      if (result.failure) this.warnings.push(result.failure);
      if (result.output === null) {
        return {
          ok: false,
          failure: result.failureScope === "provider" ? "aiUnavailable" : "generation",
          ...(result.rejection ? { rejection: result.rejection } : {}),
        };
      }
      return { ok: true, value: result.output };
    } finally {
      await this.usage.settlePlatformRetrieval({ reservationId: reserved.id, charge });
    }
  }
}
