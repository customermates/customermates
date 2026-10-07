import type { PermissionService } from "@/core/base/permission.service";
import type { EntitlementSubscriptionRepo } from "@/ee/subscription/entitlement.service";
import type { Validated } from "@/core/validation/validation.utils";
import type { GetMyConnectedAccountsRepo } from "./get-my-connected-accounts.repo";

import { z } from "zod";
import { Action, Resource } from "@/generated/prisma";

import { ConnectedAccountAppDtoSchema } from "../messaging.schema";
import { toConnectedAccountDto } from "./connected-account-dto";

import { env } from "@/env";
import { getEntitlements, isSubscriptionUsable } from "@/ee/subscription/entitlements";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

export const MessagingAccountsStateSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("unavailable") }).strict(),
  z.object({ state: z.literal("locked"), reason: z.enum(["plan", "subscription"]) }).strict(),
  z
    .object({ state: z.literal("available"), canConnect: z.boolean(), accounts: z.array(ConnectedAccountAppDtoSchema) })
    .strict(),
]);
export type MessagingAccountsState = z.infer<typeof MessagingAccountsStateSchema>;

@AllowInDemoMode
@TenantInteractor()
export class GetMessagingAccountsStateInteractor extends AuthenticatedInteractor<void, MessagingAccountsState> {
  constructor(
    private repo: GetMyConnectedAccountsRepo,
    private permissions: PermissionService,
    private subscriptions: EntitlementSubscriptionRepo,
  ) {
    super();
  }

  @ValidateOutput(MessagingAccountsStateSchema)
  async invoke(): Validated<MessagingAccountsState> {
    if (env.APP_MODE === "self-hosted" || !this.permissions.canRead(Resource.inboxMessages))
      return { ok: true as const, data: { state: "unavailable" } };
    const subscription = await this.subscriptions.getSubscriptionOrThrow();
    if (!getEntitlements(subscription.plan).messaging)
      return { ok: true as const, data: { state: "locked", reason: "plan" } };
    if (!isSubscriptionUsable(subscription))
      return { ok: true as const, data: { state: "locked", reason: "subscription" } };
    const accounts = await this.repo.listAccounts();
    return {
      ok: true as const,
      data: {
        state: "available",
        canConnect: this.permissions.has(Resource.inboxMessages, Action.create),
        accounts: accounts.filter((account) => account.status !== "deleted").map(toConnectedAccountDto),
      },
    };
  }
}
