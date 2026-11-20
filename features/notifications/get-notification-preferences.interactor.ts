import type { Validated } from "@/core/validation/validation.utils";
import type { NotificationPauseRepo } from "./notification-pause.repo";
import type { NotificationRepo } from "./notification.repo";
import type { NotificationPreferencesDto } from "./notification.schema";

import { z } from "zod";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

import {
  type NotificationMail,
  CONFIGURED_NOTIFICATION_MAIL,
  notificationPreferencesDto,
} from "./notification-preferences-dto";
import { NotificationPreferencesSchema } from "./notification.schema";

const NoInputSchema = z.object({}).strict();

@AllowInDemoMode
@TenantInteractor()
export class GetNotificationPreferencesInteractor extends AuthenticatedInteractor<
  z.infer<typeof NoInputSchema>,
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

  @Validate(NoInputSchema)
  @ValidateOutput(NotificationPreferencesSchema)
  async invoke(): Validated<NotificationPreferencesDto> {
    return {
      ok: true as const,
      data: await notificationPreferencesDto(this.repo, this.pauses, this.clock(), this.mail),
    };
  }
}
