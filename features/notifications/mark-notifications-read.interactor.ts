import { z } from "zod";

import type { Validated } from "@/core/validation/validation.utils";
import type { NotificationRepo } from "./notification.repo";
import type { MarkNotificationsReadData } from "./notification.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";

import { MarkNotificationsReadResultSchema, MarkNotificationsReadSchema } from "./notification.schema";

type MarkResult = z.infer<typeof MarkNotificationsReadResultSchema>;

@TenantInteractor()
export class MarkNotificationsReadInteractor extends AuthenticatedInteractor<MarkNotificationsReadData, MarkResult> {
  constructor(
    private readonly repo: NotificationRepo,
    private readonly clock: () => Date = () => new Date(),
  ) {
    super();
  }

  @Write({ input: MarkNotificationsReadSchema, output: MarkNotificationsReadResultSchema })
  async invoke(data: MarkNotificationsReadData): Validated<MarkResult> {
    const now = this.clock();
    const marked = data.ids ? await this.repo.markRead(data.ids, now) : await this.repo.markAllRead(now);
    return { ok: true as const, data: { marked } };
  }
}
