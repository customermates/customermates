import type { Validated } from "@/core/validation/validation.utils";
import type { NotificationRepo } from "./notification.repo";
import type { NotificationPreferencesDto } from "./notification.schema";

import { z } from "zod";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

import { DEFAULT_NOTIFICATION_EMAIL_MODES, NOTIFICATION_KINDS, NotificationPreferencesSchema } from "./notification.schema";

const NoInputSchema = z.object({}).strict();

@AllowInDemoMode
@TenantInteractor()
export class GetNotificationPreferencesInteractor extends AuthenticatedInteractor<
  z.infer<typeof NoInputSchema>,
  NotificationPreferencesDto
> {
  constructor(private readonly repo: NotificationRepo) {
    super();
  }

  @Validate(NoInputSchema)
  @ValidateOutput(NotificationPreferencesSchema)
  async invoke(): Validated<NotificationPreferencesDto> {
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
