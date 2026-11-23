import type { PermissionService } from "@/core/base/permission.service";
import type { ConnectedAccount, Prisma } from "@/generated/prisma";
import { accountUpdateData, sharedAccountUpdateData, type AccountUpdate } from "./account-update";

import type { GetMyConnectedAccountsRepo } from "../connect/get-my-connected-accounts.repo";
import type { RefreshConnectedAccountStatusesRepo } from "../connect/refresh-connected-account-statuses.repo";
import type { CountChannelsNeedingActionRepo } from "../connect/count-channels-needing-action.interactor";
import type { CreateHostedAuthLinkRepo } from "../connect/create-hosted-auth-link.repo";
import type { ThreadAccountOwnersRepo } from "../inbox/thread-account-owners.repo";
import type { MoveEmailThreadAccountRepo } from "../inbox/move-email-thread-account.repo";
import type { DeleteConnectedAccountRepo } from "../connect/delete-connected-account.repo";
import type { ResyncConnectedAccountRepo } from "../connect/resync-connected-account.repo";
import type { ReconnectConnectedAccountRepo } from "../connect/reconnect-connected-account.repo";
import type { SetConnectedAccountVisibilityRepo } from "../connect/set-connected-account-visibility.repo";
import type { SetConnectedAccountSignatureRepo } from "../connect/set-connected-account-signature.repo";
import type { AccountWebhookRepo } from "../webhooks/account/account-webhook.repo";
import type { WebhookActivityRepo } from "../webhooks/relation/relation-webhook.repo";
import type { ConnectedAccountRecord } from "../messaging.schema";
import { parseAccountConnectionDetails } from "../account-connection.schema";
import type { EmailSettings } from "../email-settings";
import { resolveStoredEmailSettings } from "../email-settings";

import { EmailFolderSchema } from "../email-folders";
import type { BackfillConnectedAccountRepo } from "../ingest/backfill/backfill.repo";
import type { UnusableProviderItemRepo } from "../ingest/unusable-provider-item.repo";
import type { ClaimBackfillRepo } from "../ingest/claim-backfill.repo";
import type { ReleaseBackfillClaimRepo } from "../ingest/release-backfill-claim.repo";
import type { FindUsableAccountRepo } from "./find-usable-account.repo";
import type { FindAccountByUnipileIdUnscopedRepo } from "./find-account-by-unipile-id-unscoped.repo";
import type { DeleteAccountForBillingRepo } from "../connect/delete-account-for-billing.repo";
import type { DeleteAccountsForPlanConnectedAccountRepo } from "../connect/delete-accounts-for-plan-connected-account.repo";
import type { DeleteConnectedAccountsForExpiredTrialsRepo } from "@/ee/lifecycle/delete-connected-accounts-for-expired-trials.interactor";
import type { DeleteConnectedAccountsForInactiveOwnersRepo } from "@/ee/lifecycle/delete-connected-accounts-for-inactive-owners.interactor";
import type { LeaveWorkspaceChannelsRepo } from "@/features/workspace/leave-workspace-channels.repo";
import type { DeleteOrphanedUnipileAccountsRepo } from "@/ee/lifecycle/delete-orphaned-unipile-accounts.interactor";
import type { RefreshInboxRepo } from "../inbox/refresh-inbox.repo";
import type { SetSelectedFoldersRepo } from "../connect/set-selected-folders.repo";
import type { FindConnectedAccountsByIdsRepo } from "../find-connected-accounts-by-ids.repo";
import type { RepoArgs } from "@/core/utils/types";
import type { MessagingFilterOptionsRepo } from "../inbox/messaging-filter-options.repo";
import type { MessagingFilterOptions } from "../inbox/messaging-filter-options.schema";
import type { BillingUsageRepo } from "@/features/billing-usage/billing-usage.repo";

import { randomUUID } from "node:crypto";

import { AccountActivityKind, ConnectedAccountStatus, Resource, Status, SubscriptionStatus } from "@/generated/prisma";

import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { accessibleConnectedAccountWhere, messageVisibilityWhere, threadAccessWhere } from "../messaging-access";
import { accountNeedsAction, isEmailProvider } from "../provider";
import { emailFolderFilterValue } from "../inbox/messaging-filter-options.schema";
import { channelChange } from "@/features/billing-usage/billing-usage-changes";

const BACKFILL_CLAIM_STALE_MS = 15 * 60 * 1000;

export class PrismaConnectedAccountRepo
  extends TenantRepository
  implements
    GetMyConnectedAccountsRepo,
    RefreshConnectedAccountStatusesRepo,
    CountChannelsNeedingActionRepo,
    CreateHostedAuthLinkRepo,
    DeleteConnectedAccountRepo,
    ResyncConnectedAccountRepo,
    ReconnectConnectedAccountRepo,
    SetConnectedAccountVisibilityRepo,
    SetConnectedAccountSignatureRepo,
    AccountWebhookRepo,
    BackfillConnectedAccountRepo,
    ClaimBackfillRepo,
    ReleaseBackfillClaimRepo,
    FindUsableAccountRepo,
    FindAccountByUnipileIdUnscopedRepo,
    ThreadAccountOwnersRepo,
    MoveEmailThreadAccountRepo,
    WebhookActivityRepo,
    DeleteAccountForBillingRepo,
    DeleteAccountsForPlanConnectedAccountRepo,
    DeleteConnectedAccountsForExpiredTrialsRepo,
    DeleteConnectedAccountsForInactiveOwnersRepo,
    LeaveWorkspaceChannelsRepo,
    DeleteOrphanedUnipileAccountsRepo,
    RefreshInboxRepo,
    SetSelectedFoldersRepo,
    FindConnectedAccountsByIdsRepo,
    MessagingFilterOptionsRepo
{
  constructor(
    private readonly permissions: PermissionService,
    private readonly diagnostics: UnusableProviderItemRepo,
    private readonly billingUsage: BillingUsageRepo,
  ) {
    super();
  }

  @BypassTenantGuard
  async createAccountUnscoped(args: RepoArgs<AccountWebhookRepo, "createAccountUnscoped">) {
    return this.withCompanyTransaction(args.companyId, () => this.createAccountWithUsage(args));
  }

  private async createAccountWithUsage(args: RepoArgs<AccountWebhookRepo, "createAccountUnscoped">) {
    const key = {
      companyId: args.companyId,
      unipileAccountId: args.unipileAccountId,
    };
    const existing = await this.prisma.connectedAccount.findUnique({
      where: { companyId_unipileAccountId: key },
      select: { id: true },
    });
    const row = await this.prisma.connectedAccount.upsert({
      where: { companyId_unipileAccountId: key },
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
    await this.billingUsage.recordChannels(row.companyId, existing ? [] : channelChange(row.id, null, row.status));

    return row;
  }

  @BypassTenantGuard
  async reviveDeletedAccountUnscoped(id: string, userId: string) {
    const owner = await this.prisma.connectedAccount.findUnique({
      where: { id },
      select: { companyId: true },
    });
    if (!owner) return null;

    return this.withCompanyTransaction(owner.companyId, async () => {
      const result = await this.prisma.connectedAccount.updateMany({
        where: {
          id,
          companyId: owner.companyId,
          status: ConnectedAccountStatus.deleted,
        },
        data: {
          userId,
          status: ConnectedAccountStatus.connecting,
          syncing: true,
          statusCheckedAt: null,
        },
      });
      if (result.count === 0) return null;
      await this.billingUsage.recordChannels(
        owner.companyId,
        channelChange(id, ConnectedAccountStatus.deleted, ConnectedAccountStatus.connecting),
      );
      return this.prisma.connectedAccount.findUnique({ where: { id } });
    });
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
  async updateAccountUnscoped(args: AccountUpdate) {
    const rows = await this.prisma.connectedAccount.findMany({
      where: { unipileAccountId: args.unipileAccountId },
      select: { id: true, companyId: true },
      orderBy: { createdAt: "asc" },
    });
    const targetId = args.connectedAccountId ?? rows[0]?.id;
    let target: ConnectedAccount | null = null;

    for (const row of rows) {
      const isTarget = args.connectedAccountId === undefined || row.id === args.connectedAccountId;
      const data = isTarget ? accountUpdateData(args) : sharedAccountUpdateData(args);
      if (Object.values(data).every((value) => value === undefined)) continue;
      const updated = await this.updateAccountRow(row, data, args.statusCheckedAt);
      if (row.id === targetId) target = updated;
    }

    return target;
  }

  private async updateAccountRow(
    row: { id: string; companyId: string },
    data: Prisma.ConnectedAccountUpdateInput,
    statusCheckedAt: Date | undefined,
  ) {
    const changesUsage = [data.status, data.displayName, data.emailAddress, data.provider].some(
      (value) => value !== undefined,
    );
    if (!changesUsage) return this.prisma.connectedAccount.update({ where: { id: row.id }, data });

    return this.withCompanyTransaction(row.companyId, async () => {
      const [before] = await this.prisma.$queryRaw<
        Array<{ status: ConnectedAccountStatus; statusCheckedAt: Date | null }>
      >`SELECT "status", "statusCheckedAt" FROM "ConnectedAccount" WHERE "id" = ${row.id} AND "companyId" = ${row.companyId} FOR UPDATE`;
      if (before?.status === ConnectedAccountStatus.deleted) return null;
      if (statusCheckedAt && before?.statusCheckedAt && before.statusCheckedAt > statusCheckedAt) return null;
      const updated = await this.prisma.connectedAccount.update({
        where: { id: row.id },
        data,
      });
      await this.billingUsage.recordChannels(row.companyId, channelChange(row.id, before?.status, updated.status));
      return updated;
    });
  }

  @BypassTenantGuard
  async markAccountSyncingUnscoped(args: RepoArgs<ClaimBackfillRepo, "markAccountSyncingUnscoped">) {
    await this.prisma.connectedAccount.updateMany({
      where: { id: args.connectedAccountId },
      data: { syncing: args.syncing },
    });
  }

  @BypassTenantGuard
  async claimBackfillUnscoped(connectedAccountId: string) {
    const token = randomUUID();
    const staleBefore = new Date(Date.now() - BACKFILL_CLAIM_STALE_MS);
    const result = await this.prisma.connectedAccount.updateMany({
      where: {
        id: connectedAccountId,
        OR: [{ backfillClaimedAt: null }, { backfillClaimedAt: { lt: staleBefore } }],
      },
      data: { backfillClaimedAt: new Date(), backfillClaimToken: token },
    });

    return result.count === 1 ? token : null;
  }

  @BypassTenantGuard
  async releaseBackfillClaimUnscoped(connectedAccountId: string, token: string, complete: boolean) {
    await this.prisma.connectedAccount.updateMany({
      where: { id: connectedAccountId, backfillClaimToken: token },
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
  async clearEmailFolderPassUnscoped(args: RepoArgs<BackfillConnectedAccountRepo, "clearEmailFolderPassUnscoped">) {
    await this.prisma.messagingFolderPassMessage.deleteMany({
      where: { companyId: args.companyId, connectedAccountId: args.connectedAccountId, folderId: args.folderId },
    });
  }

  @BypassTenantGuard
  async recordEmailFolderPassSeenUnscoped(
    args: RepoArgs<BackfillConnectedAccountRepo, "recordEmailFolderPassSeenUnscoped">,
  ) {
    if (args.unipileMessageIds.length === 0) return;

    await this.prisma.messagingFolderPassMessage.createMany({
      data: args.unipileMessageIds.map((unipileMessageId) => ({
        companyId: args.companyId,
        connectedAccountId: args.connectedAccountId,
        folderId: args.folderId,
        unipileMessageId,
      })),
      skipDuplicates: true,
    });
  }

  @BypassTenantGuard
  async listEmailFolderPassSeenUnscoped(
    args: RepoArgs<BackfillConnectedAccountRepo, "listEmailFolderPassSeenUnscoped">,
  ) {
    const rows = await this.prisma.messagingFolderPassMessage.findMany({
      where: { companyId: args.companyId, connectedAccountId: args.connectedAccountId, folderId: args.folderId },
      select: { unipileMessageId: true },
    });

    return rows.map((row) => row.unipileMessageId);
  }

  @BypassTenantGuard
  async findAccountByUnipileIdUnscoped(unipileAccountId: string, connectedAccountId?: string) {
    return this.prisma.connectedAccount.findFirst({
      where: {
        unipileAccountId,
        ...(connectedAccountId ? { id: connectedAccountId } : {}),
      },
      orderBy: { createdAt: "asc" },
    });
  }

  @BypassTenantGuard
  async findAccountForCompanyByUnipileIdUnscoped(companyId: string, unipileAccountId: string) {
    return this.prisma.connectedAccount.findUnique({
      where: { companyId_unipileAccountId: { companyId, unipileAccountId } },
    });
  }

  @BypassTenantGuard
  async listAccountIdsByUnipileIdUnscoped(unipileAccountId: string) {
    const rows = await this.prisma.connectedAccount.findMany({
      where: { unipileAccountId },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });

    return rows.map((row) => row.id);
  }

  @BypassTenantGuard
  async countOtherLiveAccountsForUnipileIdUnscoped(unipileAccountId: string, exceptId: string) {
    return this.prisma.connectedAccount.count({
      where: {
        unipileAccountId,
        id: { not: exceptId },
        status: { not: ConnectedAccountStatus.deleted },
      },
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
  recordUnusableItemUnscoped(args: RepoArgs<BackfillConnectedAccountRepo, "recordUnusableItemUnscoped">) {
    return this.diagnostics.recordUnusableItemUnscoped(args);
  }

  @BypassTenantGuard
  async findAccountByIdUnscoped(id: string) {
    return this.prisma.connectedAccount.findUnique({ where: { id } });
  }

  @BypassTenantGuard
  async findAccountsNeedingStatusRefreshUnscoped(before: Date, limit: number) {
    return this.prisma.connectedAccount.findMany({
      where: {
        status: { not: ConnectedAccountStatus.deleted },
        AND: [
          { OR: [{ statusCheckedAt: null }, { statusCheckedAt: { lt: before } }] },
          { OR: [{ statusAttemptedAt: null }, { statusAttemptedAt: { lt: before } }] },
        ],
      },
      select: { unipileAccountId: true, connectionDetails: true },
      orderBy: [{ statusCheckedAt: { sort: "asc", nulls: "first" } }, { id: "asc" }],
      take: limit,
    });
  }

  @BypassTenantGuard
  async markStatusRefreshAttemptedUnscoped(unipileAccountId: string, attemptedAt: Date) {
    await this.prisma.connectedAccount.updateMany({
      where: { unipileAccountId },
      data: { statusAttemptedAt: attemptedAt },
    });
  }

  @BypassTenantGuard
  async findAccountByIdOrThrowUnscoped(id: string) {
    return this.prisma.connectedAccount.findUniqueOrThrow({ where: { id } });
  }

  @BypassTenantGuard
  async markAccountDeletedUnscoped(id: string) {
    const owner = await this.prisma.connectedAccount.findUnique({ where: { id }, select: { companyId: true } });
    const data = { status: ConnectedAccountStatus.deleted, syncing: false };
    if (!owner) {
      await this.prisma.connectedAccount.update({ where: { id }, data });
      return;
    }
    const { companyId } = owner;

    await this.withCompanyTransaction(companyId, async () => {
      const before = await this.prisma.connectedAccount.findFirst({
        where: { id, companyId },
        select: { status: true },
      });
      await this.prisma.connectedAccount.update({ where: { id, companyId }, data });
      await this.billingUsage.recordChannels(companyId, channelChange(id, before?.status, data.status));
    });
  }

  async findOwnedConnectedAccountIdsCompanyWide(userId: string) {
    const rows = await this.prisma.connectedAccount.findMany({
      where: { companyId: this.companyId, userId, status: { not: ConnectedAccountStatus.deleted } },
      select: { id: true },
    });

    return rows.map((row) => row.id);
  }

  @BypassTenantGuard
  async listActiveAccountsForCompanyUnscoped(companyId: string) {
    return this.prisma.connectedAccount.findMany({
      where: { companyId, status: { not: ConnectedAccountStatus.deleted } },
      select: {
        id: true,
        userId: true,
        createdAt: true,
        provider: true,
        displayName: true,
        emailAddress: true,
      },
    });
  }

  @BypassTenantGuard
  async listSharedAccountsForCompanyUnscoped(companyId: string) {
    return this.prisma.connectedAccount.findMany({
      where: { companyId, shared: true, status: { not: ConnectedAccountStatus.deleted } },
      select: {
        id: true,
        userId: true,
        createdAt: true,
        provider: true,
        displayName: true,
        emailAddress: true,
      },
    });
  }

  @BypassTenantGuard
  async makeAccountPrivateUnscoped(companyId: string, accountId: string) {
    const result = await this.prisma.connectedAccount.updateMany({
      where: { id: accountId, companyId, shared: true },
      data: { shared: false },
    });
    return result.count === 1;
  }

  @BypassTenantGuard
  async findConnectedAccountIdsForExpiredTrialsUnscoped() {
    const before = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rows = await this.prisma.connectedAccount.findMany({
      where: {
        status: { not: ConnectedAccountStatus.deleted },
        company: {
          subscription: {
            status: SubscriptionStatus.trial,
            trialEndDate: { lt: before },
          },
        },
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
            status: {
              in: [SubscriptionStatus.unPaid, SubscriptionStatus.expired],
            },
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
      where: {
        id: accountId,
        ...accessibleConnectedAccountWhere(this.companyId, this.userId),
      },
      select: { folders: true, selectedFolderIds: true, foldersSyncedAt: true },
    });
    if (!row || row.foldersSyncedAt === null) return null;

    return {
      folders: EmailFolderSchema.array().catch([]).parse(row.folders),
      selectedFolderIds: row.selectedFolderIds,
    };
  }

  async findSharedThreadFolderContext(threadId: string, folderIds: string[]) {
    const thread = await this.prisma.messagingThread.findFirst({
      where: { id: threadId, ...threadAccessWhere(this.companyId, this.userId), sharedToCrm: true },
      select: { connectedAccount: { select: { folders: true, selectedFolderIds: true, foldersSyncedAt: true } } },
    });
    const row = thread?.connectedAccount;
    if (!row || row.foldersSyncedAt === null) return null;

    const visible = new Set(folderIds.filter((id) => row.selectedFolderIds.includes(id)));
    return {
      folders: EmailFolderSchema.array()
        .catch([])
        .parse(row.folders)
        .filter((folder) => visible.has(folder.id)),
      selectedFolderIds: [...visible],
    };
  }

  async findIds(ids: Set<string>): Promise<Set<string>> {
    if (ids.size === 0) return new Set();

    const rows = await this.prisma.connectedAccount.findMany({
      where: {
        id: { in: [...ids] },
        ...accessibleConnectedAccountWhere(this.companyId, this.userId),
      },
      select: { id: true },
    });

    return new Set(rows.map((row) => row.id));
  }

  private get dtoSelect() {
    return {
      id: true,
      provider: true,
      status: true,
      connectionDetails: true,
      statusCheckedAt: true,
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
      signature: true,
      signatureFields: true,
      user: {
        select: { id: true, firstName: true, lastName: true, avatarUrl: true },
      },
    } as const;
  }

  private toDto(
    row: Prisma.ConnectedAccountGetPayload<{
      select: PrismaConnectedAccountRepo["dtoSelect"];
    }>,
    isOwner: boolean,
  ): ConnectedAccountRecord {
    const { user, folders, ...account } = row;
    return {
      ...account,
      connectionDetails: parseAccountConnectionDetails(account.connectionDetails),
      folders: EmailFolderSchema.array().catch([]).parse(folders),
      owner: {
        userId: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl,
      },
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
    if (!this.permissions.canRead(Resource.inboxMessages)) return [];

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

  async listInboxFilterOptions(): Promise<MessagingFilterOptions> {
    const rows = await this.prisma.connectedAccount.findMany({
      where: {
        companyId: this.companyId,
        status: { not: ConnectedAccountStatus.deleted },
        hasMessaging: true,
        OR: [{ userId: this.userId }, { shared: true }, { threads: { some: { sharedToCrm: true } } }],
      },
      select: {
        id: true,
        provider: true,
        userId: true,
        shared: true,
        displayName: true,
        emailAddress: true,
        folders: true,
        selectedFolderIds: true,
        foldersSyncedAt: true,
        user: { select: { firstName: true, lastName: true } },
      },
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
    });

    const individualAccounts = rows.filter((row) => row.userId !== this.userId && !row.shared);
    const sharedPlacementsByAccount = new Map<string, Set<string>>();
    if (individualAccounts.length > 0) {
      const placements = await this.prisma.messagingMessage.groupBy({
        by: ["connectedAccountId", "folderIds"],
        where: {
          companyId: this.companyId,
          connectedAccountId: { in: individualAccounts.map((row) => row.id) },
          thread: { is: { companyId: this.companyId, sharedToCrm: true } },
          ...messageVisibilityWhere(
            individualAccounts
              .filter((row) => row.foldersSyncedAt !== null)
              .map((row) => ({ id: row.id, visibleSet: row.selectedFolderIds })),
          ),
        },
      });
      for (const placement of placements) {
        const ids = sharedPlacementsByAccount.get(placement.connectedAccountId) ?? new Set<string>();
        placement.folderIds.forEach((id) => ids.add(id));
        sharedPlacementsByAccount.set(placement.connectedAccountId, ids);
      }
    }

    const accounts: MessagingFilterOptions["accounts"] = [];
    const folders: MessagingFilterOptions["folders"] = [];
    for (const row of rows) {
      const fullAccountAccess = row.userId === this.userId || row.shared;
      if (!fullAccountAccess && !sharedPlacementsByAccount.has(row.id)) continue;
      const label = row.displayName || row.emailAddress || null;
      const groupLabel =
        row.emailAddress && row.emailAddress !== label
          ? row.emailAddress
          : `${row.user.firstName} ${row.user.lastName}`.trim() || null;
      accounts.push({ value: row.id, label, groupLabel, provider: row.provider });
      if (!isEmailProvider(row.provider)) continue;

      const selected = row.foldersSyncedAt ? new Set(row.selectedFolderIds) : null;
      const sharedPlacements = sharedPlacementsByAccount.get(row.id) ?? new Set<string>();
      const catalog = EmailFolderSchema.array().catch([]).parse(row.folders);
      const available = new Map(catalog.map((folder) => [folder.id, folder.name]));
      if (!fullAccountAccess) for (const id of sharedPlacements) if (!available.has(id)) available.set(id, null);

      for (const [id, name] of available) {
        if (selected && !selected.has(id)) continue;
        if (!fullAccountAccess && !sharedPlacements.has(id)) continue;
        folders.push({
          value: emailFolderFilterValue(row.id, id),
          label: name,
          groupLabel: [label, groupLabel].filter(Boolean).join(" · ") || null,
          groupKey: row.id,
          provider: row.provider,
        });
      }
    }
    return { accounts, folders };
  }

  async countAccountsNeedingAction() {
    if (!this.permissions.canRead(Resource.inboxMessages)) return 0;

    const rows = await this.prisma.connectedAccount.findMany({
      where: {
        companyId: this.companyId,
        OR: [{ userId: this.userId }, { shared: true }],
      },
      select: { status: true },
    });

    return rows.filter(accountNeedsAction).length;
  }

  async listAccountsForRefresh() {
    return this.prisma.connectedAccount.findMany({
      where: {
        companyId: this.companyId,
        OR: [{ userId: this.userId }, { shared: true }],
      },
      select: { id: true, userId: true, unipileAccountId: true, status: true },
    });
  }

  async findAccountByIdOrThrow(id: string) {
    return this.prisma.connectedAccount.findFirstOrThrow({
      where: { id, companyId: this.companyId, userId: this.userId },
    });
  }

  async findOwnedAccountById(id: string) {
    return this.prisma.connectedAccount.findFirst({
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
      select: {
        id: true,
        unipileAccountId: true,
        folders: true,
        selectedFolderIds: true,
        sentFolderIds: true,
      },
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

  async findOwnedAccountEmail(id: string) {
    const row = await this.prisma.connectedAccount.findFirst({
      where: { id, companyId: this.companyId, userId: this.userId },
      select: { signature: true, signatureFields: true },
    });
    return row
      ? { signature: row.signature, settings: resolveStoredEmailSettings(row.signature, row.signatureFields).settings }
      : null;
  }

  async setAccountSignatureOrThrow(args: { id: string; signature: string | null; settings: EmailSettings }) {
    await this.prisma.connectedAccount.updateMany({
      where: { id: args.id, companyId: this.companyId, userId: this.userId },
      data: { signature: args.signature, signatureFields: args.settings },
    });

    return this.getAccountByIdOrThrow(args.id);
  }

  async deleteAccount(id: string) {
    const { companyId, userId } = this;

    await this.withCompanyTransaction(companyId, async () => {
      const before = await this.prisma.connectedAccount.findFirst({
        where: { id, companyId, userId },
        select: { status: true },
      });
      if (!before) return;
      await this.prisma.connectedAccount.updateMany({
        where: { id, companyId, userId },
        data: { status: ConnectedAccountStatus.deleted, syncing: false },
      });
      await this.billingUsage.recordChannels(
        companyId,
        channelChange(id, before.status, ConnectedAccountStatus.deleted),
      );
    });
    await this.prisma.connectedAccount.deleteMany({ where: { id, companyId, userId } });
  }
}
