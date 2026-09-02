import type { Prisma, MessagingProvider } from "@/generated/prisma";

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
import type { DeleteAccountForBillingRepo } from "../connect/delete-account-for-billing.service";
import type { DeleteAccountsForPlanConnectedAccountRepo } from "../connect/delete-accounts-for-plan.interactor";
import type { DeleteConnectedAccountsForExpiredTrialsRepo } from "@/ee/lifecycle/delete-connected-accounts-for-expired-trials.interactor";
import type { DeleteConnectedAccountsForInactiveOwnersRepo } from "@/ee/lifecycle/delete-connected-accounts-for-inactive-owners.interactor";
import type { DeleteOrphanedUnipileAccountsRepo } from "@/ee/lifecycle/delete-orphaned-unipile-accounts.interactor";
import type { RefreshInboxRepo } from "../inbox/refresh-inbox.interactor";
import type { SetSelectedFoldersRepo } from "../connect/set-selected-folders.interactor";
import type { FindConnectedAccountsByIdsRepo } from "../find-connected-accounts-by-ids.repo";
import type { RepoArgs } from "@/core/utils/types";

import { randomUUID } from "node:crypto";

import { AccountActivityKind, ConnectedAccountStatus, Status, SubscriptionStatus } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { accessibleConnectedAccountWhere } from "../messaging-access";

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
    WebhookActivityRepo,
    DeleteAccountForBillingRepo,
    DeleteAccountsForPlanConnectedAccountRepo,
    DeleteConnectedAccountsForExpiredTrialsRepo,
    DeleteConnectedAccountsForInactiveOwnersRepo,
    DeleteOrphanedUnipileAccountsRepo,
    RefreshInboxRepo,
    SetSelectedFoldersRepo,
    FindConnectedAccountsByIdsRepo
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

    const row = await this.prisma.accountActivity.upsert({
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
      select: { id: true },
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
  async releaseBackfillClaimUnscoped(unipileAccountId: string, token: string, complete: boolean) {
    await this.prisma.connectedAccount.updateMany({
      where: { unipileAccountId, backfillClaimToken: token },
      data: {
        backfillClaimedAt: null,
        backfillClaimToken: null,
        syncing: false,
        ...(complete ? { lastSyncedAt: new Date() } : {}),
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
  }

  @BypassTenantGuard
  async findAccountByIdUnscoped(id: string) {
    return this.prisma.connectedAccount.findUnique({ where: { id } });
  }

  @BypassTenantGuard
  async findAccountByIdOrThrowUnscoped(id: string) {
    return this.prisma.connectedAccount.findUniqueOrThrow({ where: { id } });
  }

  @BypassTenantGuard
  async markAccountDeletedUnscoped(id: string) {
    await this.prisma.connectedAccount.update({
      where: { id },
      data: { status: ConnectedAccountStatus.deleted, syncing: false },
    });
  }

  @BypassTenantGuard
  async listActiveAccountsForCompanyUnscoped(companyId: string) {
    return this.prisma.connectedAccount.findMany({
      where: { companyId, status: { not: ConnectedAccountStatus.deleted } },
      select: { id: true, userId: true, createdAt: true, provider: true, displayName: true, emailAddress: true },
    });
  }

  @BypassTenantGuard
  async findConnectedAccountIdsForExpiredTrialsUnscoped() {
    const before = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rows = await this.prisma.connectedAccount.findMany({
      where: {
        status: { not: ConnectedAccountStatus.deleted },
        company: { subscription: { status: SubscriptionStatus.trial, trialEndDate: { lt: before } } },
      },
      select: { id: true },
    });

    return rows.map((row) => row.id);
  }

  @BypassTenantGuard
  async findConnectedAccountIdsForInactiveOwnersUnscoped() {
    const rows = await this.prisma.connectedAccount.findMany({
      where: {
        status: { not: ConnectedAccountStatus.deleted },
        user: { status: Status.inactive },
      },
      select: { id: true },
    });

    return rows.map((row) => row.id);
  }

  @BypassTenantGuard
  async findActiveUnipileAccountIdsUnscoped() {
    const rows = await this.prisma.connectedAccount.findMany({
      where: { status: { not: ConnectedAccountStatus.deleted } },
      select: { unipileAccountId: true },
    });

    return rows.map((row) => row.unipileAccountId);
  }

  @BypassTenantGuard
  async findConnectedAccountIdsForLapsedSubscriptionsUnscoped() {
    const before = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.connectedAccount.findMany({
      where: {
        status: { not: ConnectedAccountStatus.deleted },
        company: {
          subscription: {
            status: { in: [SubscriptionStatus.unPaid, SubscriptionStatus.expired] },
            updatedAt: { lte: before },
          },
        },
      },
      select: { id: true },
    });

    return rows.map((row) => row.id);
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
            displayName: userName || row.displayName || null,
            accountLabel: row.emailAddress ?? row.displayName,
            avatarUrl: row.ownerAvatarUrl ?? row.user.avatarUrl,
          },
        ];
      }),
    );
  }

  async findFolderContextById(accountId: string) {
    const row = await this.prisma.connectedAccount.findFirst({
      where: { id: accountId, ...accessibleConnectedAccountWhere(this.companyId, this.userId) },
      select: { folders: true, selectedFolderIds: true, foldersSyncedAt: true },
    });
    if (!row || row.foldersSyncedAt === null) return null;

    return {
      folders: EmailFolderSchema.array().catch([]).parse(row.folders),
      selectedFolderIds: row.selectedFolderIds,
    };
  }

  async findIds(ids: Set<string>): Promise<Set<string>> {
    if (ids.size === 0) return new Set();

    const rows = await this.prisma.connectedAccount.findMany({
      where: { id: { in: [...ids] }, ...accessibleConnectedAccountWhere(this.companyId, this.userId) },
      select: { id: true },
    });

    return new Set(rows.map((row) => row.id));
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
    const { user, folders, ...account } = row;
    return {
      ...account,
      folders: EmailFolderSchema.array().catch([]).parse(folders),
      owner: { userId: user.id, firstName: user.firstName, lastName: user.lastName, avatarUrl: user.avatarUrl },
      isOwner,
    };
  }

  async countActiveAccountsForUser() {
    return this.prisma.connectedAccount.count({
      where: {
        companyId: this.companyId,
        userId: this.userId,
        status: { not: ConnectedAccountStatus.deleted },
      },
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
