import type { ConnectedAccountStatus } from "@/generated/prisma";
import type { Validated } from "@/core/validation/validation.utils";
import type { PrepareBackfillInteractor } from "../ingest/backfill/prepare-backfill.interactor";
import type { BackfillChatsInteractor } from "../ingest/backfill/backfill-chats.interactor";
import type { BackfillEmailsInteractor } from "../ingest/backfill/backfill-emails.interactor";

import { z } from "zod";

import * as Sentry from "@sentry/node";

import { Action, Resource } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

import { getRetryAfterSeconds, isUnipileRateLimit } from "../messaging.service";

export const RefreshInboxResultSchema = z.object({
  rateLimited: z.boolean(),
  retryAfterSeconds: z.number().nullable(),
});
export type RefreshInboxResult = z.infer<typeof RefreshInboxResultSchema>;

export abstract class RefreshInboxRepo {
  abstract listAccountsForRefresh(): Promise<
    { id: string; unipileAccountId: string; status: ConnectedAccountStatus }[]
  >;
  abstract claimBackfillUnscoped(unipileAccountId: string): Promise<string | null>;
  abstract releaseBackfillClaimUnscoped(unipileAccountId: string, token: string): Promise<void>;
}

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.update })
export class RefreshInboxInteractor extends AuthenticatedInteractor<void, RefreshInboxResult> {
  constructor(
    private repo: RefreshInboxRepo,
    private prepare: PrepareBackfillInteractor,
    private backfillChats: BackfillChatsInteractor,
    private backfillEmails: BackfillEmailsInteractor,
  ) {
    super();
  }

  @ValidateOutput(RefreshInboxResultSchema)
  async invoke(): Validated<RefreshInboxResult> {
    const accounts = await this.repo.listAccountsForRefresh();

    let rateLimited = false;
    let retryAfterSeconds: number | null = null;

    for (const account of accounts) {
      if (account.status !== "ok") continue;

      const token = await this.repo.claimBackfillUnscoped(account.unipileAccountId);
      if (!token) continue;

      try {
        const plan = await this.prepare.invoke({ connectedAccountId: account.id, token });
        if (plan.status !== "ready") continue;

        const sources = plan.kind === "none" ? [] : plan.sources;
        for (const source of sources) {
          try {
            if (plan.kind === "email")
              await this.backfillEmails.invoke({ connectedAccountId: account.id, source, cursor: null });
            else await this.backfillChats.invoke({ connectedAccountId: account.id, source, cursor: null });
          } catch (err) {
            if (!isUnipileRateLimit(err)) throw err;
            rateLimited = true;
            retryAfterSeconds = getRetryAfterSeconds(err) ?? retryAfterSeconds;
            break;
          }
        }
      } catch (err) {
        Sentry.captureException(err);
      } finally {
        await this.repo.releaseBackfillClaimUnscoped(account.unipileAccountId, token);
      }
    }

    return { ok: true as const, data: { rateLimited, retryAfterSeconds } };
  }
}
