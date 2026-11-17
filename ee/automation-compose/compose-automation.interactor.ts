import type { Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";
import type { AutomationRecordPort } from "@/features/automation-rules/automation-ports";
import type { ComposeAutomationData, ComposeAutomationResult } from "./compose-automation.schema";
import type { ComposeModelCaller } from "./compose-model-caller";
import type { TokenBucketRateLimiter } from "@/core/network/token-bucket-rate-limiter";

import { Resource } from "@/generated/prisma";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { env } from "@/env";
import { automationModelIssues } from "@/features/automation-rules/automation-model-validation";
import { automationRuleFinalStateIssues } from "@/features/automation-rules/automation-rule.schema";

import { composeSystemPrompt } from "./compose-automation.prompt";
import { composeRateLimitKey, composeRateLimiter } from "./compose-rate-limit";
import {
  ComposeAutomationResultSchema,
  ComposeAutomationSchema,
  ComposeModelOutputSchema,
  type ComposedDraft,
} from "./compose-automation.schema";

function mateOnly(draft: ComposedDraft): ComposedDraft {
  return {
    ...draft,
    effects: draft.effects.map((effect) =>
      effect.kind === "agent" ? { kind: "agent", runtime: "mate", prompt: effect.prompt } : effect,
    ),
  };
}

@TenantInteractor({ resource: Resource.routines, manage: "create" })
export class ComposeAutomationInteractor extends AuthenticatedInteractor<
  ComposeAutomationData,
  ComposeAutomationResult
> {
  constructor(
    private readonly records: Pick<AutomationRecordPort, "model">,
    private readonly entitlements: Pick<EntitlementService, "require">,
    private readonly caller: ComposeModelCaller,
    private readonly clock: () => Date = () => new Date(),
    private readonly limiter: Pick<TokenBucketRateLimiter, "admit"> = composeRateLimiter,
  ) {
    super();
  }

  @Validate(ComposeAutomationSchema)
  @ValidateOutput(ComposeAutomationResultSchema)
  async invoke(data: ComposeAutomationData): Validated<ComposeAutomationResult> {
    if (env.APP_MODE === "self-hosted" || env.APP_MODE === "demo")
      return { ok: true as const, data: { status: "refused", reason: "unavailable" } };
    const denied = await this.entitlements.require("agentChat");
    if (denied) return denied;
    if (!this.limiter.admit(composeRateLimitKey(this.user.companyId, this.user.id)).allowed)
      return { ok: true as const, data: { status: "refused", reason: "rateLimited" } };

    const model = await this.records.model();
    const outcome = await this.caller
      .call({
        system: composeSystemPrompt(model, this.clock().toISOString().slice(0, 10)),
        prompt: `Sentence:\n"""${data.sentence}"""`,
        schema: ComposeModelOutputSchema,
      })
      .catch(() => ({ ok: false, reason: "unavailable" }) as const);

    if (!outcome.ok) return { ok: true as const, data: { status: "refused", reason: outcome.reason } };
    const output = outcome.value;
    if (output.status === "refused") return { ok: true as const, data: { status: "refused", reason: output.reason } };

    const draft = mateOnly(output.draft);
    const issues = [
      ...automationModelIssues(draft, model),
      ...automationRuleFinalStateIssues({
        trigger: draft.trigger,
        conditions: draft.conditions,
        effects: draft.effects,
      }),
    ];
    if (issues.length > 0) return { ok: true as const, data: { status: "refused", reason: "invalid" } };
    return { ok: true as const, data: { status: "draft", draft: { ...draft, enabled: true } } };
  }
}
