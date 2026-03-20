import type { Data, Validated } from "@/core/validation/validation.utils";
import type { ExtendedUser } from "../../user/user.service";

import { z } from "zod";
import { CountryCode } from "@/generated/prisma";

import { AuthService } from "../../auth/auth.service";
import { DomainEvent } from "../../event/domain-events";
import { EventService } from "../../event/event.service";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { Validate } from "@/core/decorators/validate.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { secureUrlSchema } from "@/core/validation/validation.utils";

const Schema = z
  .object({
    email: z.email(),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    country: z.enum(CountryCode),
    avatarUrl: secureUrlSchema().or(z.literal("")).nullable(),
    agreeToTerms: z.boolean(),
    marketingEmails: z.boolean(),
  })
  .superRefine((data, ctx) => {
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
  abstract findCompanyId(userId: string): Promise<string | null>;
  abstract createCompanyAndUser(args: RegisterUserData): Promise<ExtendedUser>;
  abstract registerExistingCompany(args: RegisterUserData & { companyId: string }): Promise<ExtendedUser>;
}

@SystemInteractor
export class RegisterUserInteractor {
  constructor(
    private authService: AuthService,
    private repo: RegisterUserRepo,
    private eventService: EventService,
  ) {}

  @Validate(Schema)
  @Transaction
  async invoke(data: RegisterUserData): Validated<RegisterUserData> {
    const session = await this.authService.getSessionOrRedirect();
    const companyId = await this.repo.findCompanyId(session.user.id);

    const extendedUser = companyId
      ? await this.repo.registerExistingCompany({ ...data, companyId })
      : await this.repo.createCompanyAndUser({ ...data });

    await runWithTenant(extendedUser, async () => {
      await this.eventService.publish(DomainEvent.USER_REGISTERED, {
        entityId: extendedUser.id,
        payload: {
          email: extendedUser.email,
          firstName: extendedUser.firstName,
          lastName: extendedUser.lastName,
          country: extendedUser.country,
          status: extendedUser.status,
          avatarUrl: extendedUser.avatarUrl,
          roleId: extendedUser.roleId,
          isNewCompany: !companyId,
        },
      });

      await this.authService.sendNewUserNotificationEmail({
        email: extendedUser.email,
        name: `${extendedUser.firstName} ${extendedUser.lastName}`,
      });
    });

    return { ok: true, data };
  }
}
