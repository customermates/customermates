import type { Data, Validated } from "@/core/validation/validation.utils";
import type { AuthService } from "@/features/auth/auth.service";
import type { EventService } from "@/features/event/event.service";
import type { OnboardingIntentService } from "@/features/company/onboarding-intent.service";
import type { JoinWorkspaceRepo } from "./join-workspace.repo";
import type { WorkspaceMembershipRepo } from "./workspace-membership.repo";

import { z } from "zod";
import { Status } from "@/generated/prisma";

import { env } from "@/env";
import { DomainEvent } from "@/features/event/domain-events";
import { mustVerifyEmail } from "@/features/auth/email-verification-grace";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { fail, failAuthorization } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

const Schema = z.object({ intent: z.string().min(1) });
export type JoinWorkspaceData = Data<typeof Schema>;

const OutputSchema = z.object({
  companyId: z.string(),
  status: z.enum(Status),
  alreadyMember: z.boolean(),
});
type JoinWorkspaceResult = Data<typeof OutputSchema>;

@SystemInteractor
export class JoinWorkspaceInteractor {
  constructor(
    private readonly authService: AuthService,
    private readonly onboardingIntentService: OnboardingIntentService,
    private readonly memberships: WorkspaceMembershipRepo,
    private readonly repo: JoinWorkspaceRepo,
    private readonly eventService: EventService,
  ) {}

  @Validate(Schema)
  @ValidateOutput(OutputSchema)
  async invoke(data: JoinWorkspaceData): Validated<JoinWorkspaceResult> {
    const session = await this.authService.getInteractiveSession();
    if (!session || mustVerifyEmail(session.user)) return failAuthorization(CustomErrorCode.permissionDenied);

    const intent = await this.onboardingIntentService.resolve(data.intent);
    if (intent.status !== "valid" || intent.type !== "invitation")
      return fail(CustomErrorCode.workspaceInvitationInvalid, ["intent"]);

    const { email } = session.user;
    const existing = await this.memberships.findMembershipUnscoped(email, intent.companyId);
    if (existing) {
      await this.activate(session.session.id, session.user.id, email, existing.companyId);
      return {
        ok: true as const,
        data: { companyId: existing.companyId, status: existing.status, alreadyMember: true },
      };
    }

    const profile = await this.memberships.findMembershipProfileUnscoped(email);
    if (!profile) return fail(CustomErrorCode.workspaceCreationUnavailable);

    const member = await runInTransaction(
      () =>
        this.repo.registerExistingCompany({
          email,
          firstName: profile.firstName,
          lastName: profile.lastName,
          country: profile.country,
          avatarUrl: profile.avatarUrl,
          agreeToTerms: env.APP_MODE === "cloud",
          companyId: intent.companyId,
        }),
      { companyId: intent.companyId },
    );

    await this.activate(session.session.id, session.user.id, email, member.companyId);

    await runWithTenant(member, () =>
      this.eventService.publish(DomainEvent.USER_REGISTERED, {
        entityId: member.id,
        payload: {
          email: member.email,
          firstName: member.firstName,
          lastName: member.lastName,
          country: member.country,
          status: member.status,
          avatarUrl: member.avatarUrl,
          roleId: member.roleId,
          isNewCompany: false,
        },
      }),
    );

    return { ok: true as const, data: { companyId: member.companyId, status: member.status, alreadyMember: false } };
  }

  private async activate(sessionId: string, authUserId: string, email: string, companyId: string) {
    await this.authService.setSessionActiveCompany(sessionId, companyId);
    await this.memberships.setLastUsedCompanyUnscoped(authUserId, companyId);
    await this.memberships.markMembershipActiveUnscoped(email, companyId);
  }
}
