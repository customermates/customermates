import type { Data, Validated } from "@/core/validation/validation.utils";
import type { AuthService } from "@/features/auth/auth.service";
import type { EventService } from "@/features/event/event.service";
import type { RouteGuardService } from "@/features/auth/route-guard.service";
import type { WorkspaceRegistrationService } from "@/features/user/register/workspace-registration.service";
import type { MembershipProfile, WorkspaceMembershipRepo } from "./workspace-membership.repo";

import { z } from "zod";
import { Locale, Status, Theme } from "@/generated/prisma";

import {
  CONTRACT_LEGAL_DOCUMENTS,
  currentLegalDocumentVersions,
  hasCurrentLegalDocumentVersions,
} from "@/constants/legal-documents";
import { env } from "@/env";
import { DomainEvent } from "@/features/event/domain-events";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { runAfterResponse } from "@/core/utils/after-response";
import { fail, failAuthorization, unwoundFailure } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { TeamSizeSchema, type TeamSize } from "@/features/onboarding-funnel/team-size";
import { isBusinessEmail } from "@/features/acquisition/business-email";
import { startsWithTrial } from "./workspace-trial-policy";
import { workspaceCreationRefusal } from "./workspace-creation-limit";
import { WorkspaceNameSchema } from "./workspace.schema";

const Schema = z
  .object({
    name: WorkspaceNameSchema,
    agreeToTerms: z.boolean(),
    teamSize: TeamSizeSchema.optional(),
    displayLanguage: z.enum(Locale).optional(),
  })
  .superRefine((data, ctx) => {
    if (env.APP_MODE === "cloud" && data.agreeToTerms !== true)
      ctx.addIssue({ code: "custom", params: { error: CustomErrorCode.termsNotAgreed }, path: ["agreeToTerms"] });
  });
export type CreateWorkspaceData = Data<typeof Schema>;

const CREATE_TRANSACTION_TIMEOUT_MS = 15_000;

const OutputSchema = z.object({ companyId: z.string(), slug: z.string().nullable(), trial: z.boolean() });
type CreateWorkspaceResult = Data<typeof OutputSchema>;

type Login = { authUserId: string; email: string; name: string; emailVerified: boolean | null };

function profileFromLogin(login: Login, displayLanguage: Locale | undefined): MembershipProfile {
  const [firstName = login.email, ...rest] = login.name.trim().split(/\s+/u);
  const language = displayLanguage ?? Locale.system;
  return {
    firstName,
    lastName: rest.join(" "),
    avatarUrl: null,
    displayLanguage: language,
    formattingLocale: language,
    theme: Theme.system,
  };
}

@SystemInteractor
export class CreateWorkspaceInteractor {
  constructor(
    private readonly authService: AuthService,
    private readonly routeGuardService: RouteGuardService,
    private readonly repo: WorkspaceMembershipRepo,
    private readonly registration: Pick<WorkspaceRegistrationService, "createCompanyAndUser">,
    private readonly eventService: EventService,
  ) {}

  @Validate(Schema)
  @ValidateOutput(OutputSchema)
  async invoke(data: CreateWorkspaceData): Validated<CreateWorkspaceResult> {
    const session = await this.authService.getAccountSession();
    if (!session) return failAuthorization(CustomErrorCode.permissionDenied);

    const resolution = await this.routeGuardService.resolveAccountState();
    if (resolution.state === "unauthenticated" || resolution.state === "overdueVerification")
      return failAuthorization(CustomErrorCode.permissionDenied);

    const login = {
      authUserId: session.user.id,
      email: session.user.email,
      name: session.user.name,
      emailVerified: resolution.emailVerified,
    };
    const profile = await this.repo.findMembershipProfileUnscoped(session.user.email);

    return runInTransaction(() => this.createLocked(login, data, profile), {
      timeout: CREATE_TRANSACTION_TIMEOUT_MS,
    }).catch(unwoundFailure);
  }

  async invokeForAgent(data: Omit<CreateWorkspaceData, "agreeToTerms">): Validated<CreateWorkspaceResult> {
    const session = await this.authService.getAccountSession();
    if (!session) return failAuthorization(CustomErrorCode.permissionDenied);
    if (env.APP_MODE !== "cloud") return fail(CustomErrorCode.workspaceCreationUnavailable);
    if (!(await this.hasAcceptedTerms(session.user))) return fail(CustomErrorCode.workspaceTermsNotAccepted);

    return this.invoke({ ...data, agreeToTerms: true });
  }

  private async hasAcceptedTerms(login: { id: string; email: string }): Promise<boolean> {
    const accepted = await this.repo.findAccountLegalVersionsUnscoped(login.id);
    if (hasCurrentLegalDocumentVersions(accepted, CONTRACT_LEGAL_DOCUMENTS)) return true;

    const memberships = await this.repo.listWorkspaceMembershipsUnscoped(login.email);
    return memberships.some((membership) => membership.status === Status.active);
  }

  private async createLocked(
    login: Login,
    data: CreateWorkspaceData,
    existingProfile: MembershipProfile | null,
  ): Validated<CreateWorkspaceResult> {
    if ((await this.repo.findAuthUserCompanyIdForUpdateUnscoped(login.authUserId)) === undefined)
      return failAuthorization(CustomErrorCode.permissionDenied);

    const refused = await workspaceCreationRefusal(login, this.repo, { requireVerifiedEmail: true });
    if (refused) return refused;

    const profile = existingProfile ?? profileFromLogin(login, data.displayLanguage);
    const trial = await startsWithTrial(login.authUserId, this.repo);
    const owner = await this.registration.createCompanyAndUser({
      email: login.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      avatarUrl: profile.avatarUrl,
      agreeToTerms: data.agreeToTerms,
      workspace: {
        name: data.name,
        createdByAuthUserId: login.authUserId,
        trial,
        ...(data.teamSize ? { teamSize: data.teamSize } : {}),
      },
      preferences: {
        displayLanguage: data.displayLanguage ?? profile.displayLanguage,
        formattingLocale: profile.formattingLocale,
        theme: profile.theme,
      },
    });
    await this.repo.setLastUsedCompanyUnscoped(login.authUserId, owner.companyId);

    await runWithTenant(owner, async () => {
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
          status: owner.status,
          avatarUrl: owner.avatarUrl,
          roleId: owner.roleId,
          isNewCompany: true,
        },
      });
    });
    if (!existingProfile) this.notifyFirstWorkspace(login, data.teamSize ?? null);

    return { ok: true as const, data: { companyId: owner.companyId, slug: owner.company?.slug ?? null, trial } };
  }

  private notifyFirstWorkspace(login: Login, teamSize: TeamSize | null) {
    runAfterResponse(() =>
      this.authService.sendNewUserNotificationEmail({
        email: login.email,
        name: login.name,
        signup: {
          businessEmail: isBusinessEmail(login.email),
          teamSize,
          campaign: null,
          template: null,
          lastPage: null,
        },
      }),
    );
  }
}
