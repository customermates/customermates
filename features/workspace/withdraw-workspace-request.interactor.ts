import type { Data, Validated } from "@/core/validation/validation.utils";
import type { AuthService } from "@/features/auth/auth.service";
import type { WorkspaceDepartureService } from "./workspace-departure.service";
import type { WorkspaceMembershipRepo } from "./workspace-membership.repo";

import { z } from "zod";
import { Status } from "@/generated/prisma";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { failAuthorization, failNotFound, unwoundFailure } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

const Schema = z.object({ companyId: z.uuid() });
export type WithdrawWorkspaceRequestData = Data<typeof Schema>;

const OutputSchema = z.object({ companyId: z.string() });
type WithdrawWorkspaceRequestResult = Data<typeof OutputSchema>;

@SystemInteractor
export class WithdrawWorkspaceRequestInteractor {
  constructor(
    private readonly authService: AuthService,
    private readonly repo: WorkspaceMembershipRepo,
    private readonly departure: WorkspaceDepartureService,
  ) {}

  @Validate(Schema)
  @ValidateOutput(OutputSchema)
  async invoke(data: WithdrawWorkspaceRequestData): Validated<WithdrawWorkspaceRequestResult> {
    const session = await this.authService.getInteractiveSession();
    if (!session) return failAuthorization(CustomErrorCode.permissionDenied);

    const { email } = session.user;
    const membership = await this.repo.findMembershipUnscoped(email, data.companyId);
    if (membership?.status !== Status.pendingAuthorization)
      return failNotFound(CustomErrorCode.workspaceNotFound, ["companyId"]);

    return runWithTenant(membership, async () => {
      const withdrawn = await runInTransaction(
        async () => {
          if (!(await this.repo.withdrawPendingMembershipUnscoped(email, membership.companyId)))
            return failNotFound(CustomErrorCode.workspaceNotFound, ["companyId"]);
          try {
            await this.departure.announce(membership);
          } catch (error) {
            return unwoundFailure(error);
          }
          return null;
        },
        { companyId: membership.companyId },
      );
      if (withdrawn) return withdrawn;

      await this.departure.complete({
        companyId: membership.companyId,
        member: { id: membership.id, email, status: membership.status },
        loginId: session.user.id,
      });

      return { ok: true as const, data: { companyId: membership.companyId } };
    });
  }
}
