import type { Validated } from "@/core/validation/validation.utils";
import type { NotificationRepo } from "./notification.repo";
import type { NotificationPreferencesDto, SetNotificationPreferencesData } from "./notification.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";

import {
  DEFAULT_NOTIFICATION_EMAIL_MODES,
  NOTIFICATION_KINDS,
  NotificationPreferencesSchema,
  SetNotificationPreferencesSchema,
} from "./notification.schema";

@TenantInteractor()
export class SetNotificationPreferencesInteractor extends AuthenticatedInteractor<
  SetNotificationPreferencesData,
  NotificationPreferencesDto
> {
  constructor(private readonly repo: NotificationRepo) {
    super();
  }

  @Write({ input: SetNotificationPreferencesSchema, output: NotificationPreferencesSchema })
  async invoke(data: SetNotificationPreferencesData): Validated<NotificationPreferencesDto> {
    const unique = new Map(data.preferences.map((preference) => [preference.kind, preference.emailMode]));
    await this.repo.savePreferences([...unique].map(([kind, emailMode]) => ({ kind, emailMode })));
    const stored = new Map((await this.repo.findPreferences()).map((row) => [row.kind, row.emailMode]));
    return {
      ok: true as const,
      data: {
        preferences: NOTIFICATION_KINDS.map((kind) => ({
          kind,
          emailMode: stored.get(kind) ?? DEFAULT_NOTIFICATION_EMAIL_MODES[kind],
        })),
      },
    };
  }
}
