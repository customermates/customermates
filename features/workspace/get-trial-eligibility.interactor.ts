import type { AuthService } from "@/features/auth/auth.service";
import type { WorkspaceMembershipRepo } from "./workspace-membership.repo";

import { z } from "zod";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { startsWithTrial } from "./workspace-trial-policy";

const OutputSchema = z.object({ eligible: z.boolean() });
type TrialEligibility = z.infer<typeof OutputSchema>;

@SystemInteractor
export class GetTrialEligibilityInteractor {
  constructor(
    private readonly authService: AuthService,
    private readonly repo: Pick<WorkspaceMembershipRepo, "hasConsumedTrialUnscoped" | "hasCreatedWorkspaceUnscoped">,
  ) {}

  @ValidateOutput(OutputSchema)
  async invoke(): Promise<{ ok: true; data: TrialEligibility }> {
    const session = await this.authService.getInteractiveSession();
    if (!session) return { ok: true as const, data: { eligible: false } };

    return { ok: true as const, data: { eligible: await startsWithTrial(session.user.id, this.repo) } };
  }
}
