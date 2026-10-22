import type { CalendarSubscriptionRepo } from "./planner.repo";
import type { Validated } from "@/core/validation/validation.utils";

import { createHash, randomBytes } from "node:crypto";
import { env } from "@/env";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { failConflict } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import {
  CALENDAR_SUBSCRIPTION_LIMIT,
  ManageCalendarSubscriptionsSchema,
  type ManageCalendarSubscriptionsInput,
  type SubscriptionList,
} from "./calendar-subscription.schema";
@TenantInteractor()
export class ManageCalendarSubscriptionsInteractor extends AuthenticatedInteractor<
  ManageCalendarSubscriptionsInput,
  SubscriptionList
> {
  constructor(private repo: CalendarSubscriptionRepo) {
    super();
  }
  @Validate(ManageCalendarSubscriptionsSchema)
  async invoke(input: ManageCalendarSubscriptionsInput): Validated<SubscriptionList> {
    let created: SubscriptionList["created"];
    if (input.action === "create") {
      if ((await this.repo.list()).length >= CALENDAR_SUBSCRIPTION_LIMIT) {
        return failConflict(CustomErrorCode.calendarSubscriptionLimitReached, [], {
          limit: CALENDAR_SUBSCRIPTION_LIMIT,
        });
      }
      const token = randomBytes(32).toString("base64url");
      const row = await this.repo.create(
        createHash("sha256").update(token).digest("hex"),
        input.config,
        input.includePersonalEvents,
      );
      created = { id: row.id, url: `${env.BASE_URL.replace(/\/$/u, "")}/api/calendar/subscriptions/${token}` };
    }
    if (input.action === "revoke") await this.repo.revoke(input.id);
    return {
      ok: true,
      data: {
        subscriptions: (await this.repo.list()).map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
        ...(created ? { created } : {}),
      },
    };
  }
}
