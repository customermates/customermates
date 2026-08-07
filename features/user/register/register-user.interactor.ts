import type { Data, Validated } from "@/core/validation/validation.utils";
import type { TenantUser } from "@/features/user/user.service";
import type { AuthService } from "@/features/auth/auth.service";
import type { EventService } from "@/features/event/event.service";
import type { Redirect } from "@/features/auth/auth-outcome";

import { z } from "zod";
import { CountryCode } from "@/generated/prisma";

import {
  ALL_LEGAL_DOCUMENTS,
  LEGAL_CONTRACT_KEY,
  LEGAL_INFORMATION_KEY,
  currentLegalDocumentVersions,
} from "@/constants/legal-documents";
import { env } from "@/env";

import { DomainEvent } from "@/features/event/domain-events";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { zx } from "@/core/validation/validation.utils";
import { isRedirect } from "@/features/auth/auth-outcome";
import { getLegalDeploymentCommit } from "@/features/legal/legal-deployment-commit";
import { resolveUserLocale } from "@/i18n/user-locale";

const Schema = z.object({
  email: z.email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  country: z.enum(CountryCode),
  avatarUrl: zx.secureUrl().or(z.literal("")).nullable(),
  agreeToTerms: z.boolean(),
  legalLocale: z.enum(["en", "de"]).optional(),
});
const NewCloudCompanySchema = Schema.superRefine((data, ctx) => {
  if (data.agreeToTerms !== true) {
    ctx.addIssue({
      code: "custom",
      params: { error: CustomErrorCode.termsNotAgreed },
      path: ["agreeToTerms"],
    });
  }
});
export type RegisterUserData = Data<typeof Schema>;

export abstract class RegisterUserRepo {
  abstract findCompanyIdUnscoped(userId: string): Promise<string | null>;
  abstract createCompanyAndUser(args: RegisterUserData): Promise<TenantUser>;
  abstract registerExistingCompany(args: RegisterUserData & { companyId: string }): Promise<TenantUser>;
}

@SystemInteractor
export class RegisterUserInteractor {
  constructor(
    private authService: AuthService,
    private repo: RegisterUserRepo,
    private eventService: EventService,
  ) {}

  @Validate(Schema)
  @ValidateOutput(Schema)
  @Transaction
  async invoke(data: RegisterUserData): Promise<Awaited<Validated<RegisterUserData>> | Redirect> {
    const sessionResult = await this.authService.resolveSession();
    if (isRedirect(sessionResult)) return sessionResult;
    const session = sessionResult.session;

    const companyId = await this.repo.findCompanyIdUnscoped(session.user.id);
    const isNewCloudCompany = env.APP_MODE === "cloud" && !companyId;

    if (isNewCloudCompany) {
      const acceptance = await NewCloudCompanySchema.safeParseAsync(data);
      if (!acceptance.success) return { ok: false as const, error: acceptance.error };
    }

    const registrationData = { ...data, agreeToTerms: isNewCloudCompany };

    const tenantUser = companyId
      ? await this.repo.registerExistingCompany({
          ...registrationData,
          companyId,
        })
      : await this.repo.createCompanyAndUser(registrationData);

    await runWithTenant(tenantUser, async () => {
      if (isNewCloudCompany) {
        const acceptedAt = new Date().toISOString();
        await this.eventService.publish(DomainEvent.LEGAL_DOCUMENTS_ACCEPTED, {
          entityId: LEGAL_CONTRACT_KEY,
          payload: {
            versions: currentLegalDocumentVersions(),
            contractKey: LEGAL_CONTRACT_KEY,
            informationKey: LEGAL_INFORMATION_KEY,
            changedDocuments: [...ALL_LEGAL_DOCUMENTS],
            acceptingUser: { id: tenantUser.id, email: tenantUser.email },
            locale: data.legalLocale ?? resolveUserLocale(tenantUser),
            noticeAt: null,
            effectiveAt: acceptedAt,
            providerMessageId: null,
            deployedGitCommit: getLegalDeploymentCommit(),
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
          isNewCompany: !companyId,
        },
      });

      await this.authService.sendNewUserNotificationEmail({
        email: tenantUser.email,
        name: `${tenantUser.firstName} ${tenantUser.lastName}`,
      });
    });

    return { ok: true as const, data };
  }
}
