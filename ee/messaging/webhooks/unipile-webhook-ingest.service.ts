import type { UnipileWebhookSource } from "@/generated/prisma";

import * as Sentry from "@sentry/nextjs";
import { z } from "zod";

import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { FindAccountByUnipileIdUnscopedRepo } from "../persistence/find-account-by-unipile-id-unscoped.repo";
import type { WebhookEventRepo } from "./webhook-event.repo";

const WebhookRoutingSchema = z.object({
  AccountStatus: z.object({ account_id: z.string().optional(), message: z.string().optional() }).optional(),
  account_id: z.string().optional(),
  status: z.string().optional(),
  event: z.string().optional(),
  name: z.string().optional(),
});

export abstract class WebhookUserRepo {
  abstract findUserCompanyByIdUnscoped(userId: string): Promise<{ id: string; companyId: string } | null>;
}

export class UnipileWebhookIngestService {
  constructor(
    private repo: WebhookEventRepo,
    private accountRepo: FindAccountByUnipileIdUnscopedRepo,
    private userRepo: WebhookUserRepo,
    private backgroundTaskService: BackgroundTaskService,
  ) {}

  private async resolveWebhookCompanyId(accountId: string | null, userId: string | null): Promise<string | null> {
    if (accountId) {
      const account = await this.accountRepo.findAccountByUnipileIdUnscoped(accountId);
      if (account) return account.companyId;
    }

    if (userId) {
      const user = await this.userRepo.findUserCompanyByIdUnscoped(userId);
      if (user) return user.companyId;
    }

    return null;
  }

  async ingest(source: UnipileWebhookSource, payload: unknown): Promise<void> {
    const parsed = WebhookRoutingSchema.safeParse(payload);
    const routing = parsed.success ? parsed.data : {};
    const accountId = routing.AccountStatus?.account_id ?? routing.account_id ?? null;
    const eventType = routing.AccountStatus?.message ?? routing.status ?? routing.event ?? null;
    const userId = routing.name ?? null;

    const companyId = await this.resolveWebhookCompanyId(accountId, userId);

    // Webhook events can be delivered from different environments because all environments share the same UniPile DNS endpoint.
    // If the referenced account or company does not exist in the current environment, we return early as this is an expected condition.
    if (!companyId) return;

    const { id } = await this.repo.createWebhookEventUnscoped({ companyId, source, eventType, accountId, payload });

    try {
      await this.backgroundTaskService.dispatch("process-unipile-webhook-event", { id });
    } catch (err) {
      await this.repo.markWebhookEventUnscoped({ id, processed: false });

      Sentry.captureException(err);
    }
  }
}
