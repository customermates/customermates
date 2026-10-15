import type { Data, Validated } from "@/core/validation/validation.utils";
import type { AuthService } from "@/features/auth/auth.service";
import type { EventService } from "@/features/event/event.service";
import type { RouteGuardService } from "@/features/auth/route-guard.service";
import type { InitializeRecordModelService } from "@/features/records/initialize-record-model.service";
import type { WorkspaceRegistrationService } from "@/features/user/register/workspace-registration.service";
import type { MembershipProfile, WorkspaceMembershipRepo } from "./workspace-membership.repo";

import { z } from "zod";

import { currentLegalDocumentVersions } from "@/constants/legal-documents";
import { env } from "@/env";
import { DomainEvent } from "@/features/event/domain-events";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { fail, failAuthorization, failConflict, unwoundFailure } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { startsWithTrial } from "./workspace-trial-policy";
import { workspaceCreationLimit } from "./workspace-creation-limit";
import { WorkspaceNameSchema } from "./workspace.schema";

const Schema = z
  .object({
    name: WorkspaceNameSchema,
    agreeToTerms: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (env.APP_MODE === "cloud" && data.agreeToTerms !== true)
      ctx.addIssue({ code: "custom", params: { error: CustomErrorCode.termsNotAgreed }, path: ["agreeToTerms"] });
  });
export type CreateWorkspaceData = Data<typeof Schema>;

const CREATE_TRANSACTION_TIMEOUT_MS = 15_000;

const OutputSchema = z.object({ companyId: z.string(), trial: z.boolean() });
type CreateWorkspaceResult = Data<typeof OutputSchema>;

@SystemInteractor
export class CreateWorkspaceInteractor {
  constructor(
    private readonly authService: AuthService,
    private readonly routeGuardService: RouteGuardService,
    private readonly repo: WorkspaceMembershipRepo,
    private readonly registration: Pick<WorkspaceRegistrationService, "createCompanyAndUser">,
    private readonly recordModel: Pick<InitializeRecordModelService, "initialize">,
    private readonly eventService: EventService,
  ) {}

  @Validate(Schema)
  @ValidateOutput(OutputSchema)
  async invoke(data: CreateWorkspaceData): Validated<CreateWorkspaceResult> {
    const session = await this.authService.getInteractiveSession();
    if (!session) return failAuthorization(CustomErrorCode.permissionDenied);

    const resolution = await this.routeGuardService.resolveAccountState();
    if (resolution.state === "unauthenticated" || resolution.state === "overdueVerification")
      return failAuthorization(CustomErrorCode.permissionDenied);

    const profile = await this.repo.findMembershipProfileUnscoped(session.user.email);
    if (!profile) return fail(CustomErrorCode.workspaceCreationUnavailable);

    const created = await runInTransaction(
      () => this.createLocked({ authUserId: session.user.id, email: session.user.email }, data, profile),
      { timeout: CREATE_TRANSACTION_TIMEOUT_MS },
    ).catch(unwoundFailure);
    if (!created.ok) return created;

    await this.authService.setSessionActiveCompany(session.session.id, created.data.companyId);

    return created;
  }

  private async createLocked(
    login: { authUserId: string; email: string },
    data: CreateWorkspaceData,
    profile: MembershipProfile,
  ): Validated<CreateWorkspaceResult> {
    if ((await this.repo.findAuthUserCompanyIdForUpdateUnscoped(login.authUserId)) === undefined)
      return failAuthorization(CustomErrorCode.permissionDenied);

    const limit = workspaceCreationLimit();
    if (limit !== null && (await this.repo.countCreatedWorkspacesUnscoped(login.authUserId)) >= limit)
      return failConflict(CustomErrorCode.workspaceLimitReached, [], { limit });

    const trial = await startsWithTrial(login.authUserId, this.repo);
    const owner = await this.registration.createCompanyAndUser({
      email: login.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      country: profile.country,
      avatarUrl: profile.avatarUrl,
      agreeToTerms: data.agreeToTerms,
      workspace: { name: data.name, createdByAuthUserId: login.authUserId, trial },
      preferences: {
        displayLanguage: profile.displayLanguage,
        formattingLocale: profile.formattingLocale,
        theme: profile.theme,
      },
    });
    await this.repo.setLastUsedCompanyUnscoped(login.authUserId, owner.companyId);

    await runWithTenant(owner, async () => {
      await this.recordModel.initialize();
      if (env.APP_MODE === "cloud") {
        await this.eventService.publish(DomainEvent.LEGAL_DOCUMENTS_ACCEPTED, {
          entityId: owner.companyId,
          payload: {
            versions: currentLegalDocumentVersions(),
            acceptingEmail: owner.email,
            acceptanceType: "initial-onboarding",
          },
        });
      }
      await this.eventService.publish(DomainEvent.USER_REGISTERED, {
        entityId: owner.id,
        payload: {
          email: owner.email,
          firstName: owner.firstName,
          lastName: owner.lastName,
          country: owner.country,
          status: owner.status,
          avatarUrl: owner.avatarUrl,
          roleId: owner.roleId,
          isNewCompany: true,
        },
      });
    });

    return { ok: true as const, data: { companyId: owner.companyId, trial } };
  }
}
