import type { Validated } from "@/core/validation/validation.utils";
import type { NotificationRepo } from "./notification.repo";
import type { GetNotificationsData, NotificationInbox } from "./notification.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

import { GetNotificationsSchema, NotificationInboxSchema } from "./notification.schema";

@AllowInDemoMode
@TenantInteractor()
export class GetNotificationsInteractor extends AuthenticatedInteractor<GetNotificationsData, NotificationInbox> {
  constructor(private readonly repo: NotificationRepo) {
    super();
  }

  @Validate(GetNotificationsSchema)
  @ValidateOutput(NotificationInboxSchema)
  async invoke(data: GetNotificationsData): Validated<NotificationInbox> {
    const before = data.before ? new Date(data.before) : null;
    const page = await this.repo.findInbox({
      limit: data.limit + 1,
      unreadOnly: data.unreadOnly,
      before: before && !Number.isNaN(before.getTime()) ? before : null,
    });
    const items = page.slice(0, data.limit);
    const unreadCount = await this.repo.countUnread();
    return {
      ok: true as const,
      data: {
        items: items.map((item) => ({
          id: item.id,
          kind: item.kind,
          title: item.title,
          body: item.body,
          href: item.href,
          read: item.readAt !== null,
          createdAt: item.createdAt.toISOString(),
        })),
        unreadCount,
        nextBefore: page.length > data.limit ? (items.at(-1)?.createdAt.toISOString() ?? null) : null,
      },
    };
  }
}
