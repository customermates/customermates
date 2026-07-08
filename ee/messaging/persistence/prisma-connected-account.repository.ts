import type { Prisma, MessagingProvider } from "@/generated/prisma";

import type { ConnectedAccountStatus } from "@/generated/prisma";

import type { GetMyConnectedAccountsRepo } from "../connect/get-my-connected-accounts.interactor";
import type { CreateHostedAuthLinkRepo } from "../connect/create-auth-link.interactor";
import type { ThreadAccountOwnersRepo } from "../inbox/get-messaging-thread.interactor";
import type { DeleteConnectedAccountRepo } from "../connect/delete-connected-account.interactor";
import type { ResyncConnectedAccountRepo } from "../connect/resync-connected-account.interactor";
import type { ReconnectConnectedAccountRepo } from "../connect/reconnect-connected-account.interactor";
import type { SetConnectedAccountVisibilityRepo } from "../connect/set-connected-account-visibility.interactor";
import type { AccountWebhookRepo } from "../webhooks/account/account-webhook.repo";
import type { WebhookActivityRepo } from "../webhooks/relation/relation-webhook.repo";
import type { ConnectedAccountDto } from "../messaging.schema";

import { type EmailFolder, EmailFolderSchema } from "../email-folders";
import type { BackfillConnectedAccountRepo } from "../ingest/backfill/backfill.repo";
import type { ClaimBackfillRepo } from "../ingest/claim-backfill.interactor";
import type { ReleaseBackfillClaimRepo } from "../ingest/release-backfill-claim.interactor";
import type { FindUsableAccountRepo } from "./find-usable-account.repo";
import type { FindAccountByUnipileIdUnscopedRepo } from "./find-account-by-unipile-id-unscoped.repo";
import type { RepoArgs } from "@/core/utils/types";

import { randomUUID } from "node:crypto";

import * as Sentry from "@sentry/node";

import { AccountActivityKind } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";

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
    AccountWebhookRepo,
    BackfillConnectedAccountRepo,
    ClaimBackfillRepo,
    ReleaseBackfillClaimRepo,
    FindUsableAccountRepo,
    FindAccountByUnipileIdUnscopedRepo,
    ThreadAccountOwnersRepo,
    WebhookActivityRepo
{
  @BypassTenantGuard
  async createAccountUnscoped(args: RepoArgs<AccountWebhookRepo, "createAccountUnscoped">) {
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
  async recordLinkedinConnectionAcceptedUnscoped(
    args: RepoArgs<WebhookActivityRepo, "recordLinkedinConnectionAcceptedUnscoped">,
  ) {
    const payload = {
      fullName: args.fullName,
      headline: args.headline,
      profileUrl: args.profileUrl,
      pictureUrl: args.pictureUrl,
    };

    await this.prisma.accountActivity.upsert({
      where: {
        connectedAccountId_kind_identifier: {
          connectedAccountId: args.connectedAccountId,
          kind: AccountActivityKind.linkedin_connection_accepted,
          identifier: args.providerUserId,
        },
      },
      create: {
        companyId: args.companyId,
        connectedAccountId: args.connectedAccountId,
        identifier: args.providerUserId,
        kind: AccountActivityKind.linkedin_connection_accepted,
        payload,
        occurredAt: args.occurredAt,
      },
      update: { payload, occurredAt: args.occurredAt },
    });
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
    providerSyncing?: boolean;
    ownerAvatarUrl?: string | null;
    hasMessaging?: boolean;
    hasCalendar?: boolean;
    sentFolderIds?: string[];
    folders?: EmailFolder[];
    foldersSyncedAt?: Date;
    selectedFolderIds?: string[];
    linkedinProducts?: string[];
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
        providerSyncing: args.providerSyncing,
        ownerAvatarUrl: args.ownerAvatarUrl,
        hasMessaging: args.hasMessaging,
        hasCalendar: args.hasCalendar,
        sentFolderIds: args.sentFolderIds,
        folders: args.folders as Prisma.InputJsonValue | undefined,
        foldersSyncedAt: args.foldersSyncedAt,
        selectedFolderIds: args.selectedFolderIds,
        linkedinProducts: args.linkedinProducts,
      },
    });

    return row;
  }

  @BypassTenantGuard
  async markAccountSyncingUnscoped(args: RepoArgs<ClaimBackfillRepo, "markAccountSyncingUnscoped">) {
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
  async releaseBackfillClaimUnscoped(unipileAccountId: string, token: string) {
    await this.prisma.connectedAccount.updateMany({
      where: { unipileAccountId, backfillClaimToken: token },
      data: {
        backfillClaimedAt: null,
        backfillClaimToken: null,
        syncing: false,
        providerSyncing: false,
        lastSyncedAt: new Date(),
      },
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
      Sentry.captureException(err, { tags: { connectedAccountId: args.connectedAccountId } });
    }

    Sentry.captureException(new Error(`backfill item unusable for account ${args.connectedAccountId}`), {
      tags: { connectedAccountId: args.connectedAccountId },
    });
  }

  @BypassTenantGuard
  async recordRawBackfillItemUnscoped(args: RepoArgs<BackfillConnectedAccountRepo, "recordRawBackfillItemUnscoped">) {
    try {
      await this.prisma.messagingInboundEvent.create({
        data: {
          source: "backfill",
          companyId: args.companyId,
          connectedAccountId: args.connectedAccountId,
          accountId: args.accountId,
          eventType: args.itemType,
          payload: args.payload as Prisma.InputJsonValue,
          unipileMessageId: args.unipileMessageId ?? null,
          processed: true,
        },
      });
    } catch (err) {
      Sentry.captureException(err, { tags: { connectedAccountId: args.connectedAccountId } });
    }
  }

  @BypassTenantGuard
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
        emailAddress: true,
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
            accountLabel: row.emailAddress ?? row.displayName,
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
      providerSyncing: true,
      lastSyncedAt: true,
      createdAt: true,
      folders: true,
      selectedFolderIds: true,
      foldersSyncedAt: true,
      linkedinProducts: true,
      user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
    } as const;
  }

  private toDto(
    row: Prisma.ConnectedAccountGetPayload<{ select: PrismaConnectedAccountRepo["dtoSelect"] }>,
    isOwner: boolean,
  ): ConnectedAccountDto {
    const { user, providerSyncing, syncing, folders, ...account } = row;
    return {
      ...account,
      folders: EmailFolderSchema.array().catch([]).parse(folders),
      syncing: syncing || providerSyncing,
      preparing: providerSyncing,
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

  async listAccountsForRefresh() {
    return this.prisma.connectedAccount.findMany({
      where: {
        companyId: this.companyId,
        OR: [{ userId: this.userId }, { shared: true }],
      },
      select: { id: true, unipileAccountId: true, status: true },
    });
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

  async getAccountFolderContextOrThrow(id: string) {
    const row = await this.prisma.connectedAccount.findFirstOrThrow({
      where: { id, companyId: this.companyId, userId: this.userId },
      select: { id: true, unipileAccountId: true, folders: true, selectedFolderIds: true, sentFolderIds: true },
    });

    return {
      id: row.id,
      unipileAccountId: row.unipileAccountId,
      folders: EmailFolderSchema.array().catch([]).parse(row.folders),
      selectedFolderIds: row.selectedFolderIds,
      sentFolderIds: row.sentFolderIds,
    };
  }

  async setSelectedFoldersOrThrow(args: { id: string; selectedFolderIds: string[] }) {
    await this.prisma.connectedAccount.updateMany({
      where: { id: args.id, companyId: this.companyId, userId: this.userId },
      data: { selectedFolderIds: args.selectedFolderIds },
    });

    return this.getAccountByIdOrThrow(args.id);
  }

  async deleteAccount(id: string) {
    await this.prisma.connectedAccount.deleteMany({ where: { id, companyId: this.companyId, userId: this.userId } });
  }
}
