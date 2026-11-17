import type { AgentRetrievalCharge, AgentUsageService } from "@/ee/agent-chat/agent-usage.service";
import type { ComposeModelCall, ComposeModelOutcome } from "./compose-model-caller";

import { UserAccessor } from "@/core/base/user-accessor";
import { AGENT_MODELS } from "@/ee/agent-chat/model-catalog";
import { generateStructuredObject, structuredCallWorstCaseMicrocents } from "@/ee/agent-chat/structured-model-call";

import { ComposeModelCaller } from "./compose-model-caller";

type Usage = Pick<AgentUsageService, "prepareRetrieval" | "reserveRetrieval" | "settleRetrieval" | "getUsageSummary">;

export class HostedComposeModelCaller extends ComposeModelCaller {
  private readonly accessor = new UserAccessor();

  constructor(
    private readonly usage: Usage,
    private readonly clock: () => Date = () => new Date(),
  ) {
    super();
  }

  async call<T>(call: ComposeModelCall<T>): Promise<ComposeModelOutcome<T>> {
    const now = this.clock();
    const userId = this.accessor.userId;
    const model = AGENT_MODELS.setupDrafting;
    const grant = await this.usage.prepareRetrieval(userId, now, "automationCompose");
    const reservation = grant
      ? await this.usage.reserveRetrieval({
          grant,
          worstCaseMicrocents: structuredCallWorstCaseMicrocents(model, call.system, call.prompt, call.schema),
          model: model.modelId,
          now,
        })
      : null;
    if (!reservation) {
      const summary = await this.usage.getUsageSummary(userId, now);
      return { ok: false, reason: summary.blockedReason === "credits_exhausted" ? "credits" : "unavailable" };
    }

    let charge: AgentRetrievalCharge | null = {
      model: model.modelId,
      inputTokens: 0,
      costMicrocents: reservation.reservedMicrocents,
      costSource: "estimated",
    };
    try {
      const result = await generateStructuredObject({
        label: "Automation composer",
        model,
        schema: call.schema,
        system: call.system,
        prompt: call.prompt,
        retrySchemaCompilation: true,
      });
      charge = result.charge;
      return result.output === null ? { ok: false, reason: "unavailable" } : { ok: true, value: result.output };
    } finally {
      await this.usage.settleRetrieval({ reservation, charge, now: this.clock() });
    }
  }
}
