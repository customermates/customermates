import type { FindAccountByUnipileIdUnscopedRepo } from "../persistence/find-account-by-unipile-id-unscoped.repo";

import { ConnectedAccountStatus, AccountActivityKind, MessagingProvider } from "@/generated/prisma";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";

import { UnipileUsersWebhookSchema, type UnipileUsersWebhook } from "../unipile.schema";

export abstract class ProcessUsersWebhookRepo {
  abstract insertAccountActivityUnscoped(args: {
    companyId: string;
    connectedAccountId: string;
    identifier: string;
    kind: AccountActivityKind;
    payload: Record<string, unknown>;
    occurredAt: Date;
  }): Promise<void>;
}

@SystemInteractor
export class ProcessUsersWebhookInteractor {
  constructor(
    private repo: ProcessUsersWebhookRepo,
    private accountRepo: FindAccountByUnipileIdUnscopedRepo,
  ) {}

  @Enforce(UnipileUsersWebhookSchema)
  async invoke(payload: UnipileUsersWebhook): Promise<void> {
    const account = await this.accountRepo.findAccountByUnipileIdOrThrowUnscoped(payload.account_id);
    if (account.status === ConnectedAccountStatus.deleted) return;
    if (account.provider !== MessagingProvider.linkedin) return;

    const candidates = [payload.user_public_identifier, payload.user_provider_id].filter((value): value is string =>
      Boolean(value),
    );

    if (candidates.length === 0)
      throw new Error(`relation webhook for account ${payload.account_id} has no user identifier`);

    await this.repo.insertAccountActivityUnscoped({
      companyId: account.companyId,
      connectedAccountId: account.id,
      identifier: candidates[0],
      kind: AccountActivityKind.linkedin_connection_accepted,
      payload: {
        fullName: payload.user_full_name ?? null,
        profileUrl: payload.user_profile_url ?? null,
        pictureUrl: payload.user_picture_url ?? null,
      },
      occurredAt: payload.timestamp,
    });
  }
}
