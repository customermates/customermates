import type { Validated } from "@/core/validation/validation.utils";
import type { NotificationPauseRepo } from "./notification-pause.repo";
import type { NotificationRepo } from "./notification.repo";
import type { NotificationPreferencesDto, SetNotificationPauseData } from "./notification.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { createZodError } from "@/core/validation/validation.utils";

import { notificationPauseEnd, notificationPauseEndIsAllowed } from "./notification-pause";
import {
  type NotificationMail,
  CONFIGURED_NOTIFICATION_MAIL,
  notificationPreferencesDto,
} from "./notification-preferences-dto";
import { NotificationPreferencesSchema, SetNotificationPauseSchema } from "./notification.schema";

@TenantInteractor()
export class SetNotificationPauseInteractor extends AuthenticatedInteractor<
  SetNotificationPauseData,
  NotificationPreferencesDto
> {
  constructor(
    private readonly repo: NotificationRepo,
    private readonly pauses: NotificationPauseRepo,
    private readonly clock: () => Date = () => new Date(),
    private readonly mail: NotificationMail = CONFIGURED_NOTIFICATION_MAIL,
  ) {
    super();
  }

  @Write({ input: SetNotificationPauseSchema, output: NotificationPreferencesSchema })
  async invoke(data: SetNotificationPauseData): Validated<NotificationPreferencesDto> {
    const now = this.clock();
    if (data.until === null) await this.pauses.clear();
    else {
      const end = notificationPauseEnd(data.until, data.timeZone);
      if (!end || !notificationPauseEndIsAllowed(data.until, data.timeZone, now))
        return { ok: false, error: createZodError(CustomErrorCode.notificationPauseDateInvalid, ["until"]) };
      await this.pauses.save({ until: end, timeZone: data.timeZone });
    }
    return { ok: true as const, data: await notificationPreferencesDto(this.repo, this.pauses, now, this.mail) };
  }
}
