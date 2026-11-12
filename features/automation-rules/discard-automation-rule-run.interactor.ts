import { z } from "zod";

import type { AutomationRuleRepo } from "./automation-rule.repo";

import { Enforce } from "@/core/decorators/enforce.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

import { AUTOMATION_RUN_STALE_MS } from "./run-automation-rule.interactor";

const Schema = z
  .object({ runId: z.uuid(), companyId: z.uuid(), reason: z.enum(["ownerInactive", "ownerMissing"]) })
  .strict();
type DiscardAutomationRuleRunInput = z.infer<typeof Schema>;

@SystemInteractor
export class DiscardAutomationRuleRunInteractor {
  constructor(
    private readonly repo: AutomationRuleRepo,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  @Enforce(Schema)
  async invoke(input: DiscardAutomationRuleRunInput): Promise<{ discarded: boolean }> {
    const found = await this.repo.findRunUnscoped(input.companyId, input.runId);
    if (!found) return { discarded: false };
    const now = this.clock();
    const claimed = await this.repo.claimRunUnscoped(
      input.runId,
      input.companyId,
      now,
      new Date(now.getTime() - AUTOMATION_RUN_STALE_MS),
    );
    if (!claimed) return { discarded: false };
    await this.repo.settleRunUnscoped({
      runId: input.runId,
      companyId: input.companyId,
      ruleId: found.run.ruleId,
      status: "skipped",
      outcome: { effects: [], reason: input.reason },
      error: null,
      now,
    });
    await this.repo.disableRuleUnscoped(input.companyId, found.run.ruleId, input.reason);
    return { discarded: true };
  }
}
