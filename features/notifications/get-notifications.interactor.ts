import type { Validated } from "@/core/validation/validation.utils";
import type { InboxCursor, NotificationRepo } from "./notification.repo";
import type { GetNotificationsData, NotificationInbox } from "./notification.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

import { GetNotificationsSchema, NotificationInboxSchema } from "./notification.schema";

const CURSOR_SEPARATOR = "_";
const CURSOR_ID = /^[0-9a-f-]{36}$/u;

export function formatInboxCursor(row: { createdAt: Date; id: string }): string {
  return `${row.createdAt.toISOString()}${CURSOR_SEPARATOR}${row.id}`;
}

export function parseInboxCursor(value: string | undefined): InboxCursor | null {
  if (!value) return null;
  const [stamp, id] = value.split(CURSOR_SEPARATOR);
  const createdAt = new Date(stamp);
  if (Number.isNaN(createdAt.getTime())) return null;
  return { createdAt, id: id !== undefined && CURSOR_ID.test(id) ? id : null };
}

@AllowInDemoMode
@TenantInteractor()
export class GetNotificationsInteractor extends AuthenticatedInteractor<GetNotificationsData, NotificationInbox> {
  constructor(private readonly repo: NotificationRepo) {
    super();
  }

  @Validate(GetNotificationsSchema)
  @ValidateOutput(NotificationInboxSchema)
  async invoke(data: GetNotificationsData): Validated<NotificationInbox> {
    const page = await this.repo.findInbox({
      limit: data.limit + 1,
      unreadOnly: data.unreadOnly,
      before: parseInboxCursor(data.before),
    });
    const items = page.slice(0, data.limit);
    const last = items.at(-1);
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
        nextBefore: page.length > data.limit && last ? formatInboxCursor(last) : null,
      },
    };
  }
}
