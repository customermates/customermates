import type { Data } from "@/core/validation/validation.utils";
import type { EventService } from "@/features/event/event.service";

import { z } from "zod";
import type { Locale } from "@/generated/prisma";
import { CountryCode, Theme } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { zx, type Validated } from "@/core/validation/validation.utils";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { DomainEvent } from "@/features/event/domain-events";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import {
  StoredDisplayLanguageSchema,
  StoredFormattingLocaleSchema,
  normalizeStoredDisplayLanguage,
  normalizeStoredFormattingLocale,
} from "@/i18n/user-locale";

export const UpdateUserDetailsSchema = z.object({
  firstName: z.string().min(1).max(255).optional(),
  lastName: z.string().min(1).max(255).optional(),
  country: z.enum(CountryCode).optional(),
  avatarUrl: zx.secureUrl().or(z.literal("")).nullable().optional(),
  theme: z.enum(Theme).optional(),
  displayLanguage: StoredDisplayLanguageSchema.optional(),
  formattingLocale: StoredFormattingLocaleSchema.optional(),
});
export type UpdateUserDetailsData = Data<typeof UpdateUserDetailsSchema>;

const OutputSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  country: z.enum(CountryCode),
  avatarUrl: z.string().nullable(),
  theme: z.enum(Theme),
  displayLanguage: StoredDisplayLanguageSchema,
  formattingLocale: StoredFormattingLocaleSchema,
});
export type UserProfileData = Data<typeof OutputSchema>;

type StoredUserProfileData = Omit<UserProfileData, "displayLanguage" | "formattingLocale"> & {
  displayLanguage: Locale;
  formattingLocale: Locale;
};

export abstract class UpdateUserDetailsRepo {
  abstract updateDetails(args: UpdateUserDetailsData): Promise<StoredUserProfileData>;
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
  @Transaction
  @ValidateOutput(OutputSchema)
  async invoke(data: UpdateUserDetailsData): Validated<UserProfileData> {
    const storedProfile = await this.repo.updateDetails(data);
    const profile = {
      ...storedProfile,
      displayLanguage: normalizeStoredDisplayLanguage(storedProfile.displayLanguage),
      formattingLocale: normalizeStoredFormattingLocale(storedProfile.formattingLocale),
    };

    await this.eventService.publish(DomainEvent.USER_UPDATED, {
      entityId: this.userId,
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
