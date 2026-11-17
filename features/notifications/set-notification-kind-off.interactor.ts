import type { Validated } from "@/core/validation/validation.utils";
import type { NotificationRepo } from "./notification.repo";
import type { SetNotificationKindOffData, SetNotificationKindOffResult } from "./notification.schema";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { resolveUserLocale } from "@/i18n/user-locale";

import { SetNotificationKindOffSchema } from "./notification.schema";
import { notificationUnsubscribeSecret, verifyNotificationUnsubscribe } from "./notification-unsubscribe-token";

@SystemInteractor
export class SetNotificationKindOffInteractor {
  constructor(
    private readonly repo: NotificationRepo,
    private readonly authSecret: string | undefined,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  @Validate(SetNotificationKindOffSchema)
  async invoke({ token, confirmed }: SetNotificationKindOffData): Validated<SetNotificationKindOffResult> {
    const secret = notificationUnsubscribeSecret(this.authSecret);
    if (!secret) return { ok: true as const, data: { status: "invalid" } };
    const grant = verifyNotificationUnsubscribe(secret, token, this.clock());
    if (grant.status !== "valid") return { ok: true as const, data: { status: grant.status } };
    const [recipient] = await this.repo.findRecipientsUnscoped(grant.companyId, [grant.userId]);
    if (!recipient) return { ok: true as const, data: { status: "invalid" } };
    if (confirmed) await this.repo.saveEmailModeUnscoped(grant.companyId, grant.userId, grant.kind, "off");
    return {
      ok: true as const,
      data: {
        status: confirmed ? "off" : "pending",
        kind: grant.kind,
        workspaceSlug: recipient.workspaceSlug,
        locale: resolveUserLocale(recipient),
      },
    };
  }
}
