import { z } from "zod";

import { ConnectedAccountStatus } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";

import { mapUnipileStatus } from "../../unipile.mappers";
import type { AccountWebhookRepo } from "./account-webhook.repo";

const Schema = z.object({
  type: z.enum([
    "account.status.disconnected",
    "account.status.errored",
    "account.status.paused",
    "account.status.running",
  ]),
  account_id: z.string(),
});
type Payload = z.infer<typeof Schema>;

@SystemInteractor
export class ProcessAccountStatusWebhookInteractor {
  constructor(private accountRepo: AccountWebhookRepo) {}

  @Enforce(Schema)
  async invoke(envelope: Payload): Promise<void> {
    const account = await this.accountRepo.findAccountByUnipileIdOrThrowUnscoped(envelope.account_id);
    if (account.status === ConnectedAccountStatus.deleted) return;

    const status = mapUnipileStatus(envelope.type.slice("account.status.".length));
    const stalled =
      status === ConnectedAccountStatus.credentials ||
      status === ConnectedAccountStatus.error ||
      status === ConnectedAccountStatus.stopped;

    await this.accountRepo.updateAccountUnscoped({
      unipileAccountId: account.unipileAccountId,
      status,
      ...(stalled && { syncing: false }),
    });
  }
}
