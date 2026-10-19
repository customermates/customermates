import type { Data } from "@/core/validation/validation.utils";
import type { AuthService } from "@/features/auth/auth.service";
import type { EventService } from "@/features/event/event.service";
import type { UpdateUserDetailsRepo } from "./update-user-details.repo";

import { z } from "zod";
import type { Locale } from "@/generated/prisma";
import { Theme } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { zx, type Validated } from "@/core/validation/validation.utils";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { DomainEvent } from "@/features/event/domain-events";
import { calculateChanges } from "@/core/utils/calculate-changes";
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
  avatarUrl: zx.secureUrl().or(z.literal("")).nullable().optional(),
  theme: z.enum(Theme).optional(),
  displayLanguage: StoredDisplayLanguageSchema.optional(),
  formattingLocale: StoredFormattingLocaleSchema.optional(),
});
export type UpdateUserDetailsData = Data<typeof UpdateUserDetailsSchema>;

export const UserProfileSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  avatarUrl: z.string().nullable(),
  theme: z.enum(Theme),
  displayLanguage: StoredDisplayLanguageSchema,
  formattingLocale: StoredFormattingLocaleSchema,
});
export type UserProfileData = Data<typeof UserProfileSchema>;

export type StoredUserProfileData = Omit<UserProfileData, "displayLanguage" | "formattingLocale"> & {
  displayLanguage: Locale;
  formattingLocale: Locale;
};

const PERSONAL_PROFILE_FIELDS = [
  "firstName",
  "lastName",
  "avatarUrl",
  "theme",
  "displayLanguage",
  "formattingLocale",
] as const satisfies readonly (keyof StoredUserProfileData)[];

@TenantInteractor()
export class UpdateUserDetailsInteractor extends AuthenticatedInteractor<UpdateUserDetailsData, UserProfileData> {
  constructor(
    private repo: UpdateUserDetailsRepo,
    private eventService: EventService,
    private authService: Pick<AuthService, "getInteractiveSession">,
  ) {
    super();
  }

  @Validate(UpdateUserDetailsSchema)
  @Transaction
  @ValidateOutput(UserProfileSchema)
  async invoke(data: UpdateUserDetailsData): Validated<UserProfileData> {
    const previous = { firstName: this.user.firstName, lastName: this.user.lastName };
    const storedProfile = await this.repo.updateDetails(data);
    const profile = {
      ...storedProfile,
      displayLanguage: normalizeStoredDisplayLanguage(storedProfile.displayLanguage),
      formattingLocale: normalizeStoredFormattingLocale(storedProfile.formattingLocale),
    };

    const changes = calculateChanges(previous, {
      firstName: profile.firstName,
      lastName: profile.lastName,
    });
    if (Object.keys(changes).length)
      await this.eventService.publish(DomainEvent.USER_UPDATED, { entityId: this.userId, payload: { changes } });

    if (await this.isInteractiveSession()) await this.applyToOtherMemberships(data, storedProfile);

    return { ok: true as const, data: profile };
  }

  private async isInteractiveSession(): Promise<boolean> {
    const session = await this.authService.getInteractiveSession().catch(() => null);
    return session?.user.email === this.user.email;
  }

  private async applyToOtherMemberships(data: UpdateUserDetailsData, storedProfile: StoredUserProfileData) {
    const personal = Object.fromEntries(
      PERSONAL_PROFILE_FIELDS.filter((field) => data[field] !== undefined).map((field) => [
        field,
        storedProfile[field],
      ]),
    ) as Partial<StoredUserProfileData>;
    if (Object.keys(personal).length === 0) return;

    const memberships = await this.repo.applyPersonalProfileToOtherMembershipsUnscoped({
      email: this.user.email,
      exceptUserId: this.userId,
      profile: personal,
    });

    for (const membership of memberships) {
      const changes = calculateChanges(
        { firstName: membership.firstName, lastName: membership.lastName },
        {
          firstName: personal.firstName ?? membership.firstName,
          lastName: personal.lastName ?? membership.lastName,
        },
      );
      if (Object.keys(changes).length) {
        await this.eventService.publish(
          DomainEvent.USER_UPDATED,
          { entityId: membership.id, payload: { changes } },
          { systemCompanyId: membership.companyId, systemUserId: membership.id },
        );
      }
    }
  }
}
