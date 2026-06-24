import type { Prisma, MessagingProvider, ConnectedAccountStatus } from "@/generated/prisma";

import type { GetMyConnectedAccountsRepo } from "../connect/get-my-connected-accounts.interactor";
import type { CreateHostedAuthLinkRepo } from "../connect/create-hosted-auth-link.interactor";
import type { ThreadAccountOwnersRepo } from "../inbox/get-messaging-thread.interactor";
import type { DeleteConnectedAccountRepo } from "../connect/delete-connected-account.interactor";
import type { ResyncConnectedAccountRepo } from "../connect/resync-connected-account.interactor";
import type { ReconnectConnectedAccountRepo } from "../connect/reconnect-connected-account.interactor";
import type { SetConnectedAccountVisibilityRepo } from "../connect/set-connected-account-visibility.interactor";
import type { ProcessAccountCallbackRepo } from "../webhooks/process-account-callback.interactor";
import type { ProcessAccountStatusWebhookRepo } from "../webhooks/process-account-status-webhook.interactor";
import type { CalendarAccountRepo } from "@/ee/messaging/webhooks/calendar-account.repo";
import type { ConnectedAccountDto } from "../messaging.schema";
import type { BackfillConnectedAccountRepo } from "../ingest/backfill/backfill.repo";
import type { ReleaseBackfillClaimRepo } from "../ingest/release-backfill-claim.interactor";
import type { FindUsableAccountRepo } from "./find-usable-account.repo";
import type { FindAccountByUnipileIdUnscopedRepo } from "./find-account-by-unipile-id-unscoped.repo";
import type { MessagingWebhookAccountRepo } from "../webhooks/process-messaging-webhook.interactor";
import type { RepoArgs } from "@/core/utils/types";

import { randomUUID } from "node:crypto";

import * as Sentry from "@sentry/node";

import { BaseRepository } from "@/core/base/base-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { BackfillCheckpointSchema } from "../ingest/backfill/backfill-checkpoint.schema";

const BACKFILL_CLAIM_STALE_MS = 15 * 60 * 1000;

export class PrismaConnectedAccountRepo
  extends BaseRepository
  implements
    GetMyConnectedAccountsRepo,
    CreateHostedAuthLinkRepo,
    DeleteConnectedAccountRepo,
    ResyncConnectedAccountRepo,
    ReconnectConnectedAccountRepo,
    SetConnectedAccountVisibilityRepo,
    ProcessAccountCallbackRepo,
    ProcessAccountStatusWebhookRepo,
    BackfillConnectedAccountRepo,
    ReleaseBackfillClaimRepo,
    FindUsableAccountRepo,
    FindAccountByUnipileIdUnscopedRepo,
    MessagingWebhookAccountRepo,
    CalendarAccountRepo,
    ThreadAccountOwnersRepo
{
  @BypassTenantGuard
  async createAccountUnscoped(args: RepoArgs<ProcessAccountCallbackRepo, "createAccountUnscoped">) {
    const row = await this.prisma.connectedAccount.upsert({
      where: { unipileAccountId: args.unipileAccountId },
      update: {},
      create: {
        companyId: args.companyId,
        userId: args.userId,
        unipileAccountId: args.unipileAccountId,
        provider: args.provider,
        status: args.status,
        displayName: args.displayName,
        emailAddress: args.emailAddress,
        hasMessaging: args.hasMessaging,
        hasCalendar: args.hasCalendar,
        syncing: true,
      },
    });

    return row;
  }

  @BypassTenantGuard
  async updateAccountUnscoped(args: {
    unipileAccountId: string;
    status?: ConnectedAccountStatus;
    displayName?: string | null;
    emailAddress?: string | null;
    lastSyncedAt?: Date;
    provider?: MessagingProvider;
    syncing?: boolean;
    ownerAvatarUrl?: string | null;
    hasMessaging?: boolean;
    hasCalendar?: boolean;
  }) {
    const { unipileAccountId } = args;

    const row = await this.prisma.connectedAccount.update({
      where: { unipileAccountId },
      data: {
        status: args.status,
        displayName: args.displayName,
        emailAddress: args.emailAddress,
        lastSyncedAt: args.lastSyncedAt,
        provider: args.provider,
        syncing: args.syncing,
        ownerAvatarUrl: args.ownerAvatarUrl,
        hasMessaging: args.hasMessaging,
        hasCalendar: args.hasCalendar,
      },
    });

    return row;
  }

  @BypassTenantGuard
  async markAccountSyncingUnscoped(args: RepoArgs<ResyncConnectedAccountRepo, "markAccountSyncingUnscoped">) {
    await this.prisma.connectedAccount.updateMany({
      where: { unipileAccountId: args.unipileAccountId },
      data: { syncing: args.syncing },
    });
  }

  @BypassTenantGuard
  async claimBackfillUnscoped(unipileAccountId: string) {
    const token = randomUUID();
    const staleBefore = new Date(Date.now() - BACKFILL_CLAIM_STALE_MS);
    const result = await this.prisma.connectedAccount.updateMany({
      where: {
        unipileAccountId,
        OR: [{ backfillClaimedAt: null }, { backfillClaimedAt: { lt: staleBefore } }],
      },
      data: { backfillClaimedAt: new Date(), backfillClaimToken: token },
    });

    return result.count === 1 ? token : null;
  }

  @BypassTenantGuard
  async refreshBackfillClaimUnscoped(unipileAccountId: string, token: string) {
    const result = await this.prisma.connectedAccount.updateMany({
      where: { unipileAccountId, backfillClaimToken: token },
      data: { backfillClaimedAt: new Date() },
    });

    return result.count === 1;
  }

  @BypassTenantGuard
  async releaseBackfillClaimUnscoped(unipileAccountId: string, token: string) {
    await this.prisma.connectedAccount.updateMany({
      where: { unipileAccountId, backfillClaimToken: token },
      data: { backfillClaimedAt: null, backfillClaimToken: null, syncing: false },
    });
  }

  @BypassTenantGuard
  async finalizeBackfillUnscoped(args: { unipileAccountId: string; epoch: number; token: string }) {
    const result = await this.prisma.connectedAccount.updateMany({
      where: { unipileAccountId: args.unipileAccountId, backfillEpoch: args.epoch, backfillClaimToken: args.token },
      data: { syncing: false, lastSyncedAt: new Date(), backfillClaimedAt: null, backfillClaimToken: null },
    });

    return result.count === 1;
  }

  @BypassTenantGuard
  async setAccountOwnAttendeeIdUnscoped(
    args: RepoArgs<BackfillConnectedAccountRepo, "setAccountOwnAttendeeIdUnscoped">,
  ) {
    await this.prisma.connectedAccount.updateMany({
      where: { unipileAccountId: args.unipileAccountId },
      data: { ownUnipileAttendeeId: args.ownUnipileAttendeeId },
    });
  }

  @BypassTenantGuard
  async setAccountOwnAttendeeIdIfNullUnscoped(
    args: RepoArgs<MessagingWebhookAccountRepo, "setAccountOwnAttendeeIdIfNullUnscoped">,
  ) {
    await this.prisma.connectedAccount.updateMany({
      where: { unipileAccountId: args.unipileAccountId, ownUnipileAttendeeId: null },
      data: { ownUnipileAttendeeId: args.ownUnipileAttendeeId },
    });
  }

  @BypassTenantGuard
  async markAccountHasCalendarUnscoped(unipileAccountId: string) {
    await this.prisma.connectedAccount.updateMany({
      where: { unipileAccountId },
      data: { hasCalendar: true },
    });
  }

  @BypassTenantGuard
  async findAccountByUnipileIdUnscoped(unipileAccountId: string) {
    const row = await this.prisma.connectedAccount.findUnique({
      where: { unipileAccountId },
    });

    return row;
  }

  @BypassTenantGuard
  async findAccountByUnipileIdOrThrowUnscoped(unipileAccountId: string) {
    return this.prisma.connectedAccount.findUniqueOrThrow({
      where: { unipileAccountId },
    });
  }

  async findUsableAccountByIdOrThrow(id: string) {
    const row = await this.prisma.connectedAccount.findFirstOrThrow({
      where: {
        id,
        companyId: this.companyId,
        OR: [{ userId: this.userId }, { shared: true }],
      },
    });

    return row;
  }

  @BypassTenantGuard
  async loadBackfillCheckpointUnscoped(unipileAccountId: string) {
    const row = await this.prisma.connectedAccount.findUnique({
      where: { unipileAccountId },
      select: { backfillCheckpoint: true, backfillEpoch: true },
    });
    const epoch = row?.backfillEpoch ?? 0;
    const parsed = BackfillCheckpointSchema.safeParse(row?.backfillCheckpoint ?? {});

    if (!parsed.success) {
      Sentry.captureException(
        new Error(`backfill checkpoint shape drift for ${unipileAccountId}: ${parsed.error.message}`),
      );
      return { checkpoint: {}, epoch };
    }

    return { checkpoint: parsed.data, epoch };
  }

  @BypassTenantGuard
  async saveBackfillStepCheckpointUnscoped(
    args: RepoArgs<BackfillConnectedAccountRepo, "saveBackfillStepCheckpointUnscoped">,
  ) {
    await this.prisma.$executeRaw`
      UPDATE "ConnectedAccount"
      SET "backfillCheckpoint" = jsonb_set(
        COALESCE("backfillCheckpoint", '{}'::jsonb),
        ARRAY[${args.step}]::text[],
        ${JSON.stringify(args.checkpoint)}::jsonb,
        true
      ),
      "backfillClaimedAt" = NOW()
      WHERE "unipileAccountId" = ${args.unipileAccountId}
        AND "backfillEpoch" = ${args.epoch}
    `;
  }

  @BypassTenantGuard
  async recordUnusableItemUnscoped(args: RepoArgs<BackfillConnectedAccountRepo, "recordUnusableItemUnscoped">) {
    try {
      await this.prisma.messagingInboundEvent.create({
        data: {
          source: "backfill",
          companyId: args.companyId,
          connectedAccountId: args.connectedAccountId,
          payload: args.payload as Prisma.InputJsonValue,
          unipileMessageId: args.unipileMessageId ?? null,
          processed: false,
        },
      });
    } catch (err) {
      Sentry.captureException(err);
    }

    Sentry.captureException(new Error(`backfill item unusable for account ${args.connectedAccountId}`));
  }

  @BypassTenantGuard
  async resetBackfillCheckpointUnscoped(unipileAccountId: string) {
    await this.prisma.connectedAccount.updateMany({
      where: { unipileAccountId },
      data: { backfillCheckpoint: {}, backfillEpoch: { increment: 1 } },
    });
  }

  @BypassTenantGuard
  async findAccountByIdOrThrowUnscoped(id: string) {
    const row = await this.prisma.connectedAccount.findUniqueOrThrow({
      where: { id },
    });

    return row;
  }

  async findAccountByIdUnscoped(id: string) {
    return this.prisma.connectedAccount.findUnique({ where: { id } });
  }

  async listAccountOwnersByIds(accountIds: string[]) {
    if (accountIds.length === 0) return {};

    const rows = await this.prisma.connectedAccount.findMany({
      where: { id: { in: accountIds }, companyId: this.companyId },
      select: {
        id: true,
        displayName: true,
        ownerAvatarUrl: true,
        user: { select: { firstName: true, lastName: true, avatarUrl: true } },
      },
    });

    return Object.fromEntries(
      rows.map((row) => {
        const userName = `${row.user.firstName} ${row.user.lastName}`.trim();

        return [
          row.id,
          {
            displayName: userName || row.displayName || "You",
            avatarUrl: row.ownerAvatarUrl ?? row.user.avatarUrl,
          },
        ];
      }),
    );
  }

  private get dtoSelect() {
    return {
      id: true,
      provider: true,
      status: true,
      hasMessaging: true,
      hasCalendar: true,
      emailAddress: true,
      displayName: true,
      shared: true,
      syncing: true,
      lastSyncedAt: true,
      createdAt: true,
      user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
    } as const;
  }

  private toDto(
    row: Prisma.ConnectedAccountGetPayload<{ select: PrismaConnectedAccountRepo["dtoSelect"] }>,
    isOwner: boolean,
  ): ConnectedAccountDto {
    const { user, ...account } = row;
    return {
      ...account,
      owner: { userId: user.id, firstName: user.firstName, lastName: user.lastName, avatarUrl: user.avatarUrl },
      isOwner,
    };
  }

  async getSubscriptionStatus() {
    const subscription = await this.prisma.subscription.findUniqueOrThrow({
      where: { companyId: this.companyId },
      select: { status: true },
    });

    return subscription.status;
  }

  async countAccounts() {
    return this.prisma.connectedAccount.count({
      where: { companyId: this.companyId, userId: this.userId },
    });
  }

  async listAccounts() {
    const rows = await this.prisma.connectedAccount.findMany({
      where: {
        companyId: this.companyId,
        OR: [{ userId: this.userId }, { shared: true }],
      },
      select: this.dtoSelect,
      orderBy: { createdAt: "desc" },
    });

    return rows
      .map((row) => this.toDto(row, row.user.id === this.userId))
      .sort((a, b) => Number(b.isOwner) - Number(a.isOwner) || b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findAccountByIdOrThrow(id: string) {
    return this.prisma.connectedAccount.findFirstOrThrow({
      where: { id, companyId: this.companyId, userId: this.userId },
    });
  }

  async getAccountByIdOrThrow(id: string) {
    const row = await this.prisma.connectedAccount.findFirstOrThrow({
      where: { id, companyId: this.companyId, userId: this.userId },
      select: this.dtoSelect,
    });

    return this.toDto(row, true);
  }

  async setAccountSharedOrThrow(args: RepoArgs<SetConnectedAccountVisibilityRepo, "setAccountSharedOrThrow">) {
    const existing = await this.getAccountByIdOrThrow(args.id);

    await this.prisma.connectedAccount.updateMany({
      where: { id: args.id, companyId: this.companyId, userId: this.userId },
      data: { shared: args.shared },
    });

    return { ...existing, shared: args.shared };
  }

  async deleteAccount(id: string) {
    await this.prisma.connectedAccount.deleteMany({ where: { id, companyId: this.companyId, userId: this.userId } });
  }
}
