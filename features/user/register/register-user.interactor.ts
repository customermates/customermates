import type { Data, Validated } from "@/core/validation/validation.utils";
import type { TenantUser } from "@/features/user/user.service";
import type { AuthService } from "@/features/auth/auth.service";
import type { EventService } from "@/features/event/event.service";
import type { RouteGuardService } from "@/features/auth/route-guard.service";
import type { Redirect } from "@/features/auth/auth-outcome";

import { z } from "zod";
import { CountryCode, Status } from "@/generated/prisma";

import { currentLegalDocumentVersions } from "@/constants/legal-documents";
import { env } from "@/env";

import { DomainEvent } from "@/features/event/domain-events";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { zx } from "@/core/validation/validation.utils";
import { accountStateRedirect } from "@/features/auth/account-state";
import { redirectTo } from "@/features/auth/auth-outcome";
import {
  RegistrationAdAttributionSchema,
  type RegistrationAdAttribution,
} from "@/features/acquisition/ad-attribution.schema";

export const RegisterUserSchema = z
  .object({
    email: z.email(),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    country: z.enum(CountryCode),
    avatarUrl: zx.secureUrl().or(z.literal("")).nullable(),
    agreeToTerms: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (env.APP_MODE === "cloud" && data.agreeToTerms !== true) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.termsNotAgreed },
        path: ["agreeToTerms"],
      });
    }
  });
export type RegisterUserData = Data<typeof RegisterUserSchema>;

const OutputSchema = z.object({
  redirectTo: z.enum(["/auth/pending", "/onboarding/wizard"]),
});
export type RegisterUserResult = Data<typeof OutputSchema>;

const RegistrationTargetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("createCompany") }),
  z.object({ type: z.literal("invitation"), companyId: z.string().min(1) }),
  z.object({ type: z.literal("existingAuthUserCompanyBinding") }),
]);
export type RegistrationTarget = Data<typeof RegistrationTargetSchema>;

const RegistrationSchema = RegisterUserSchema.extend({
  sessionUserId: z.string().min(1),
  adAttribution: z.array(RegistrationAdAttributionSchema),
  target: RegistrationTargetSchema,
});
type RegistrationData = Data<typeof RegistrationSchema>;

type RegistrationContext = {
  adAttribution?: RegistrationAdAttribution[];
  target: RegistrationTarget;
};

export abstract class RegisterUserRepo {
  abstract peekAuthUserCompanyIdUnscoped(userId: string): Promise<string | null | undefined>;
  abstract findAuthUserCompanyIdForUpdateUnscoped(userId: string): Promise<string | null | undefined>;
  abstract findCurrentUserUnscoped(email: string): Promise<TenantUser | null>;
  abstract bindAuthUserToCompanyOrThrowUnscoped(args: { authUserId: string; companyId: string }): Promise<void>;
  abstract createCompanyAndUser(
    args: RegisterUserData & {
      adAttribution?: RegistrationAdAttribution[];
    },
  ): Promise<TenantUser>;
  abstract registerExistingCompany(args: RegisterUserData & { companyId: string }): Promise<TenantUser>;
}

export abstract class RegisterUserCompanyRepo {
  abstract existsUnscoped(companyId: string): Promise<boolean>;
}

@SystemInteractor
export class RegisterUserInteractor {
  constructor(
    private authService: AuthService,
    private repo: RegisterUserRepo,
    private eventService: EventService,
    private routeGuardService: RouteGuardService,
    private companyRepo: RegisterUserCompanyRepo,
  ) {}

  async invoke(
    data: RegisterUserData,
    context: RegistrationContext,
  ): Promise<Awaited<Validated<RegisterUserResult>> | Redirect> {
    const resolution = await this.routeGuardService.resolveAccountState();
    if (!resolution.sessionUser) return redirectTo("/auth/signin");
    if (resolution.state !== "unregistered") return redirectTo(accountStateRedirect(resolution.state) ?? "/");

    return this.register({
      ...data,
      email: resolution.sessionUser.email,
      sessionUserId: resolution.sessionUser.id,
      adAttribution: context.adAttribution ?? [],
      target: context.target,
    });
  }

  @Validate(RegistrationSchema)
  private async register(data: RegistrationData): Promise<Awaited<Validated<RegisterUserResult>> | Redirect> {
    const plannedCompanyId =
      data.target.type === "invitation"
        ? data.target.companyId
        : data.target.type === "existingAuthUserCompanyBinding"
          ? await this.repo.peekAuthUserCompanyIdUnscoped(data.sessionUserId)
          : null;

    return runInTransaction(
      () => this.registerLocked(data, plannedCompanyId),
      plannedCompanyId ? { companyId: plannedCompanyId } : undefined,
    );
  }

  @ValidateOutput(OutputSchema)
  private async registerLocked(
    data: RegistrationData,
    plannedCompanyId: string | null | undefined,
  ): Promise<Awaited<Validated<RegisterUserResult>> | Redirect> {
    const { sessionUserId, adAttribution, target, ...registrationData } = data;
    if (plannedCompanyId && !(await this.companyRepo.existsUnscoped(plannedCompanyId)))
      return redirectTo(target.type === "invitation" ? "/auth/error?type=invalidInviteLink" : "/onboarding");

    const authUserCompanyId = await this.repo.findAuthUserCompanyIdForUpdateUnscoped(sessionUserId);
    if (authUserCompanyId === undefined) return redirectTo("/auth/signup");
    const existingUser = await this.repo.findCurrentUserUnscoped(registrationData.email);
    if (existingUser) {
      return redirectTo(
        existingUser.status === Status.pendingAuthorization
          ? "/auth/pending"
          : existingUser.status === Status.inactive
            ? "/auth/error?type=inactiveUser"
            : "/onboarding/wizard",
      );
    }
    if (target.type === "existingAuthUserCompanyBinding" && authUserCompanyId !== plannedCompanyId)
      return redirectTo("/onboarding");

    const companyId =
      target.type === "invitation"
        ? target.companyId
        : target.type === "existingAuthUserCompanyBinding"
          ? authUserCompanyId
          : null;
    if (!companyId && target.type !== "createCompany") return redirectTo("/onboarding");

    const isNewCloudCompany = env.APP_MODE === "cloud" && target.type === "createCompany";
    const eligibleAdAttribution =
      env.APP_MODE === "cloud"
        ? adAttribution.filter((attribution) => attribution.expiresAt.getTime() > Date.now())
        : [];

    const tenantUser = companyId
      ? await this.repo.registerExistingCompany({
          ...registrationData,
          companyId,
        })
      : await this.repo.createCompanyAndUser({
          ...registrationData,
          adAttribution: eligibleAdAttribution,
        });

    await this.repo.bindAuthUserToCompanyOrThrowUnscoped({
      authUserId: sessionUserId,
      companyId: tenantUser.companyId,
    });

    await runWithTenant(tenantUser, async () => {
      if (isNewCloudCompany) {
        await this.eventService.publish(DomainEvent.LEGAL_DOCUMENTS_ACCEPTED, {
          entityId: tenantUser.companyId,
          payload: {
            versions: currentLegalDocumentVersions(),
            acceptingEmail: tenantUser.email,
            acceptanceType: "initial-onboarding",
          },
        });
      }

      await this.eventService.publish(DomainEvent.USER_REGISTERED, {
        entityId: tenantUser.id,
        payload: {
          email: tenantUser.email,
          firstName: tenantUser.firstName,
          lastName: tenantUser.lastName,
          country: tenantUser.country,
          status: tenantUser.status,
          avatarUrl: tenantUser.avatarUrl,
          roleId: tenantUser.roleId,
          isNewCompany: target.type === "createCompany",
        },
      });

      await this.authService.sendNewUserNotificationEmail({
        email: tenantUser.email,
        name: `${tenantUser.firstName} ${tenantUser.lastName}`,
      });
    });

    return {
      ok: true as const,
      data: {
        redirectTo: tenantUser.status === Status.pendingAuthorization ? "/auth/pending" : "/onboarding/wizard",
      },
    };
  }
}
