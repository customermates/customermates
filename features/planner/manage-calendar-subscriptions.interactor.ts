import type { CalendarSubscriptionRepo } from "./planner.repo";
import type { Validated } from "@/core/validation/validation.utils";

import { randomBytes } from "node:crypto";
import { env } from "@/env";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { INTERACTIVE_COMPANY_LOCK_WAIT_MS, runInTransaction } from "@/core/decorators/transaction-runner";
import { failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { calendarSubscriptionTokenHash } from "./calendar-subscription-tenant";

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
      const token = randomBytes(32).toString("base64url");
      const row = await runInTransaction(
        async () =>
          (await this.repo.list()).length >= CALENDAR_SUBSCRIPTION_LIMIT
            ? null
            : this.repo.create(calendarSubscriptionTokenHash(token), input.config, input.includePersonalEvents),
        { companyLockWait: INTERACTIVE_COMPANY_LOCK_WAIT_MS },
      );
      if (!row) {
        return failConflict(CustomErrorCode.calendarSubscriptionLimitReached, [], {
          limit: CALENDAR_SUBSCRIPTION_LIMIT,
        });
      }
      created = { id: row.id, url: `${env.BASE_URL.replace(/\/$/u, "")}/api/calendar/subscriptions/${token}` };
    }
    if (input.action === "revoke" && !(await this.repo.revoke(input.id)))
      return failNotFound(CustomErrorCode.calendarSubscriptionNotFound, ["id"]);
    return {
      ok: true,
      data: {
        subscriptions: (await this.repo.list()).map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
        ...(created ? { created } : {}),
      },
    };
  }
}
