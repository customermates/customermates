import type { Validated } from "@/core/validation/validation.utils";
import type { NotificationPauseRepo } from "./notification-pause.repo";
import type { NotificationRepo } from "./notification.repo";
import type { NotificationPreferencesDto, SetNotificationPreferencesData } from "./notification.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";

import { notificationPreferencesDto } from "./notification-preferences-dto";
import { NotificationPreferencesSchema, SetNotificationPreferencesSchema } from "./notification.schema";

@TenantInteractor()
export class SetNotificationPreferencesInteractor extends AuthenticatedInteractor<
  SetNotificationPreferencesData,
  NotificationPreferencesDto
> {
  constructor(
    private readonly repo: NotificationRepo,
    private readonly pauses: NotificationPauseRepo,
    private readonly clock: () => Date = () => new Date(),
  ) {
    super();
  }

  @Write({ input: SetNotificationPreferencesSchema, output: NotificationPreferencesSchema })
  async invoke(data: SetNotificationPreferencesData): Validated<NotificationPreferencesDto> {
    const unique = new Map(data.preferences.map((preference) => [preference.kind, preference.emailMode]));
    await this.repo.savePreferences([...unique].map(([kind, emailMode]) => ({ kind, emailMode })));
    return { ok: true as const, data: await notificationPreferencesDto(this.repo, this.pauses, this.clock()) };
  }
}
