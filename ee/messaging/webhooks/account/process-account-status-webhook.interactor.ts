import { z } from "zod";

import { ConnectedAccountStatus } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";

import { deriveAccountConnection } from "../../account-connection";
import type { MessagingService } from "../../messaging.service";
import type { AccountWebhookRepo } from "./account-webhook.repo";

const Schema = z.object({
  type: z.enum([
    "account.status.degraded",
    "account.status.disconnected",
    "account.status.errored",
    "account.status.partial",
    "account.status.running",
  ]),
  account_id: z.string(),
  connectedAccountId: z.uuid().optional(),
  product: z.string().nullish(),
  reason: z.unknown().optional(),
  error: z.unknown().optional(),
  payload: z
    .looseObject({ product: z.string().nullish(), reason: z.unknown().optional(), error: z.unknown().optional() })
    .nullish(),
});
type Payload = z.infer<typeof Schema>;

@SystemInteractor
export class ProcessAccountStatusWebhookInteractor {
  constructor(
    private accountRepo: AccountWebhookRepo,
    private messagingService: MessagingService,
  ) {}

  @Enforce(Schema)
  async invoke(envelope: Payload): Promise<void> {
    const account = await this.accountRepo.findAccountByUnipileIdUnscoped(
      envelope.account_id,
      envelope.connectedAccountId,
    );
    if (!account || account.status === ConnectedAccountStatus.deleted) return;

    const checkedAt = new Date();
    const snapshot = await this.messagingService.getAccount(account.unipileAccountId);
    const eventStatus = envelope.type.slice("account.status.".length);
    const product = envelope.product ?? envelope.payload?.product;
    const matches = product
      ? Object.entries(snapshot.metadata?.products_connection_status ?? {}).some(
          ([name, productStatus]) => name.toLowerCase() === product.toLowerCase() && productStatus === eventStatus,
        )
      : snapshot.status === eventStatus;
    const connection = deriveAccountConnection(
      snapshot,
      matches ? (envelope.reason ?? envelope.error ?? envelope.payload?.reason ?? envelope.payload?.error) : undefined,
      account.connectionDetails,
      checkedAt,
    );
    const { status } = connection;
    const stalled =
      status === ConnectedAccountStatus.credentials ||
      status === ConnectedAccountStatus.error ||
      status === ConnectedAccountStatus.stopped;

    await this.accountRepo.updateAccountUnscoped({
      unipileAccountId: account.unipileAccountId,
      connectedAccountId: account.id,
      ...connection,
      ...(stalled && { syncing: false }),
    });
  }
}
