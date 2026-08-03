import type { Data } from "@/core/validation/validation.utils";
import type { EventService } from "@/features/event/event.service";

import { z } from "zod";
import { CountryCode, Locale, Theme } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { zx, type Validated } from "@/core/validation/validation.utils";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { DomainEvent } from "@/features/event/domain-events";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { getTenantUser } from "@/core/decorators/tenant-context";
import { APP_LOCALES } from "@/i18n/locale-registry";

const [firstAppLocale, ...otherAppLocales] = APP_LOCALES;

export const UpdateUserDetailsSchema = z.object({
  firstName: z.string().min(1).max(255).optional(),
  lastName: z.string().min(1).max(255).optional(),
  country: z.enum(CountryCode).optional(),
  avatarUrl: zx.secureUrl().or(z.literal("")).nullable().optional(),
  theme: z.enum(Theme).optional(),
  displayLanguage: z.enum([firstAppLocale, ...otherAppLocales, Locale.system]).optional(),
  formattingLocale: z.enum(Locale).optional(),
});
export type UpdateUserDetailsData = Data<typeof UpdateUserDetailsSchema>;

const OutputSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  country: z.enum(CountryCode),
  avatarUrl: z.string().nullable(),
  theme: z.enum(Theme),
  displayLanguage: z.enum(Locale),
  formattingLocale: z.enum(Locale),
});
export type UserProfileData = Data<typeof OutputSchema>;

export abstract class UpdateUserDetailsRepo {
  abstract updateDetails(args: UpdateUserDetailsData): Promise<UserProfileData>;
}

@TenantInteractor()
export class UpdateUserDetailsInteractor extends AuthenticatedInteractor<UpdateUserDetailsData, UserProfileData> {
  constructor(
    private repo: UpdateUserDetailsRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Validate(UpdateUserDetailsSchema)
  @ValidateOutput(OutputSchema)
  @Transaction
  async invoke(data: UpdateUserDetailsData): Validated<UserProfileData> {
    const profile = await this.repo.updateDetails(data);

    await this.eventService.publish(DomainEvent.USER_UPDATED, {
      entityId: getTenantUser().id,
      payload: {
        firstName: profile.firstName,
        lastName: profile.lastName,
        country: profile.country,
        avatarUrl: profile.avatarUrl,
      },
    });

    return { ok: true as const, data: profile };
  }
}
