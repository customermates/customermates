import { unwindFailure } from "@/core/validation/failure-unwind";
import { CustomErrorCode } from "@/core/validation/validation.types";
import type { RecordRepo } from "@/features/records/record.repo";
import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { MessagingProvider } from "@/generated/prisma";
import { compileMessagingRecordQuery } from "./messaging-record-query";

import {
  MessagingDraftSendState,
  MessagingMessageDirection,
  MessagingMessageOrigin,
  MessagingThreadState,
  MessagingThreadType,
  Prisma,
} from "@/generated/prisma";

import type { AttachmentMeta, IngestMessage, MessagingAttendee, MessagingMessage } from "../messaging.schema";

import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { RepoArgs } from "@/core/utils/types";
import type { RecordIdentityReference } from "@/features/records/record-identity-reference.schema";
import type { FindThreadsByIdsRepo } from "../find-threads-by-ids.repo";
import type { GetMessageAttachmentMetaRepo } from "../inbox/get-message-attachment.repo";
import type { GetMessagingThreadRepo } from "../inbox/get-messaging-thread.repo";
import type { GetMessagingThreadsRepo } from "@/ee/messaging/inbox/get-messaging-threads.repo";
import type { GetUnreadThreadCountRepo } from "../inbox/get-unread-thread-count.repo";
import type { MoveEmailThreadRepo } from "../inbox/move-email-thread.repo";
import type { ResyncThreadRepo } from "../inbox/resync-thread.repo";
import type { ChannelCandidateDto } from "../inbox/search-channel-candidates.interactor";
import type { SearchChannelCandidatesRepo } from "../inbox/search-channel-candidates.repo";
import type { MessagingIngestRepo } from "../ingest/messaging-ingest.repo";
import type { DiscardDraftRepo } from "../outbound/discard-draft.repo";
import type { PruneDraftSendsRepo } from "../outbound/prune-draft-sends.repo";
import type { SaveDraftRepo } from "../outbound/save-draft.repo";
import type { SendChatMessageRepo } from "../outbound/send-chat-message.repo";
import type { SendEmailRepo } from "../outbound/send-email.repo";
import type { StartChatThreadRepo } from "../outbound/start-chat-thread.repo";
import type { UpdateThreadRepo } from "../thread-state/update-thread.repo";

import { QueryRepository } from "@/core/base/query-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import type { RecordIdentityReader } from "@/features/records/record-identity-reader";
import type { MessagingFilterOptionsRepo } from "../inbox/messaging-filter-options.repo";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";
import type { PreviewKind } from "../attachment-kind";

import { identifierKey } from "@/features/records/record-identity";
import { classifyAttachment } from "../attachment-kind";
import { draftRevisionMatches, normalizeDraftThreadRecipients, type DraftDeleteResult } from "../draft-thread";
import {
  decideDraftSend,
  decideMissingDraftSend,
  effectiveDraftSendState,
  type DraftSendClaim,
  type DraftSendRecord,
  type DraftSendStart,
} from "../draft-send";
import { newDraftThreadProviderId } from "../draft-thread-id";
import { htmlToPlainText } from "../email-body-text";
import { identityLookupValue } from "../identity-lookup";
import {
  accessibleFolderStatesWhere,
  canViewAccountMessages,
  inboxThreadVisibilityWhere,
  limitMessageFolderIds,
  messageVisibilityWhere,
  accessibleConnectedAccountWhere,
  redactMessageBcc,
  threadAccessWhere,
} from "../messaging-access";
import { channelClass, DRAFT_THREAD_PREFIX, isDraftThreadId, isEmailProvider, isHandleProvider } from "../provider";

type MappedThreadRow = ReturnType<PrismaMessagingRepo["mapThreadRow"]>;
type ThreadRow = Prisma.MessagingThreadGetPayload<{ select: PrismaMessagingRepo["threadSelect"] }>;
type ConvertDraftToSentArgs = {
  messageId: string;
  expectedUpdatedAt: Date;
  unipileMessageId: string;
  providerMessageId: string | null;
  sender: MessagingAttendee;
  recipients: {
    to: MessagingAttendee[];
    cc: MessagingAttendee[];
    bcc: MessagingAttendee[];
  };
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  attachmentsMeta: AttachmentMeta[];
  sentAt: Date;
};

function draftMessageProviderId(threadId: string): string {
  return `draft_${threadId}`;
}

export class PrismaMessagingRepo
  extends QueryRepository
  implements
    GetMessagingThreadRepo,
    ResyncThreadRepo,
    MoveEmailThreadRepo,
    GetMessagingThreadsRepo,
    GetUnreadThreadCountRepo,
    UpdateThreadRepo,
    MessagingIngestRepo,
    SendChatMessageRepo,
    SendEmailRepo,
    StartChatThreadRepo,
    SaveDraftRepo,
    DiscardDraftRepo,
    PruneDraftSendsRepo,
    SearchChannelCandidatesRepo,
    GetMessageAttachmentMetaRepo,
    FindThreadsByIdsRepo
{
  constructor(
    private readonly inboxRecords: Pick<RecordRepo, "getModel">,
    private readonly inboxPolicy: Pick<RecordAccessPolicy, "load">,
    private readonly identities?: Pick<RecordIdentityReader, "resolve">,
    private readonly filterOptions?: MessagingFilterOptionsRepo,
  ) {
    super();
  }

  async searchChannelCandidates(query: RepoArgs<SearchChannelCandidatesRepo, "searchChannelCandidates">) {
    const rows = await this.prisma.messagingThreadParticipant.findMany({
      where: {
        companyId: this.companyId,
        isSelf: false,
        OR: [
          { displayName: { contains: query, mode: "insensitive" } },
          { identifier: { contains: query, mode: "insensitive" } },
        ],
        thread: threadAccessWhere(this.companyId, this.userId),
      },
      select: {
        provider: true,
        identifier: true,
        displayName: true,
        profileUrl: true,
        providerUserId: true,
      },
      take: 50,
    });

    const seen = new Set<string>();
    const candidates: ChannelCandidateDto[] = [];
    for (const row of rows) {
      if (!row.identifier) continue;
      const key = `${channelClass(row.provider)}:${row.identifier}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({
        provider: row.provider,
        value: row.identifier,
        displayName: row.displayName,
        profileUrl: row.profileUrl,
        messagingId: isHandleProvider(row.provider) ? (row.providerUserId ?? null) : null,
      });
      if (candidates.length >= 10) break;
    }

    return candidates;
  }

  private get participantSelect() {
    return {
      providerUserId: true,
      identifier: true,
      displayName: true,
      pictureUrl: true,
      profileUrl: true,
      headline: true,
      occupation: true,
      isSelf: true,
    } as const;
  }

  private get threadSelect() {
    return {
      id: true,
      connectedAccountId: true,
      unipileThreadId: true,
      provider: true,
      type: true,
      name: true,
      subject: true,
      lastMessageAt: true,
      lastMessagePreview: true,
      lastMessageIsSender: true,
      sharedToCrm: true,
      connectedAccount: { select: { shared: true, userId: true } },
      participants: {
        select: this.participantSelect,
        orderBy: { createdAt: "asc" as const },
      },
      state: true,
      createdAt: true,
      updatedAt: true,
      messages: {
        where: { isHidden: false },
        select: {
          direction: true,
          bodyText: true,
          bodyHtml: true,
          sender: true,
          attachmentsMeta: true,
          isEvent: true,
          isDeleted: true,
          isDraft: true,
        },
        orderBy: { sentAt: "desc" as const },
        take: 1,
      },
    } as const;
  }

  getSortableFields() {
    return [
      {
        field: "lastMessageAt",
        resolvedFields: ["lastMessageAt"],
        nullable: true,
      },
    ];
  }

  protected getDefaultOrderBy() {
    return [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { id: "desc" }];
  }

  getSearchableFields() {
    return [
      { field: "subject" },
      { field: "messages.bodyText" },
      { field: "name" },
      { field: "participants.displayName" },
      { field: "participants.identifier" },
    ];
  }

  async getFilterableFields() {
    if (!this.filterOptions) throw new Error("Messaging inbox filter options are not configured");
    const options = await this.filterOptions.listInboxFilterOptions();
    return [
      {
        field: FilterFieldKey.state,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.state],
      },
      {
        field: FilterFieldKey.participantContactId,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.participantContactId],
      },
      {
        field: FilterFieldKey.participants,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.participants],
      },
      {
        field: FilterFieldKey.provider,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.provider],
      },
      {
        field: FilterFieldKey.draft,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.draft],
      },
      {
        field: FilterFieldKey.connectedAccountId,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.connectedAccountId],
        options: options.accounts,
      },
      {
        field: FilterFieldKey.emailFolder,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.emailFolder],
        options: options.folders,
      },
      {
        field: FilterFieldKey.lastMessageDirection,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.lastMessageDirection],
      },
      {
        field: FilterFieldKey.lastMessageSentAt,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.lastMessageSentAt],
      },
      {
        field: FilterFieldKey.lastMessageAt,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.lastMessageAt],
      },
    ];
  }

  private async hydrateThreadContacts<T extends MappedThreadRow>(threads: T[]): Promise<T[]> {
    const pairs = threads.flatMap((thread) => {
      const fromParticipants = thread.participants
        .filter((p) => p.identifier)
        .map((p) => ({ provider: thread.provider, value: p.identifier }));
      if (thread.lastMessageSenderIdentifier) {
        fromParticipants.push({
          provider: thread.provider,
          value: thread.lastMessageSenderIdentifier,
        });
      }
      return fromParticipants;
    });
    if (pairs.length === 0) return threads;

    const contactByKey = await this.resolveContactsByIdentifiers(pairs);
    for (const thread of threads) {
      for (const participant of thread.participants)
        participant.records = contactByKey.get(identifierKey(thread.provider, participant.identifier)) ?? [];
    }

    await this.resolveParticipantNamesAcrossThreads(threads);

    return threads;
  }

  private async resolveBestNamesByProviderUserId(
    participants: Array<{
      provider: MessagingProvider;
      providerUserId: string;
    }>,
  ): Promise<Map<string, string>> {
    const identities = [
      ...new Map(
        participants.map((participant) => [
          JSON.stringify([participant.provider, participant.providerUserId]),
          participant,
        ]),
      ).values(),
    ];
    if (!identities.length) return new Map();

    const rows = await this.prisma.messagingThreadParticipant.findMany({
      where: {
        companyId: this.companyId,
        OR: identities,
        thread: threadAccessWhere(this.companyId, this.userId),
      },
      select: { provider: true, providerUserId: true, displayName: true },
      orderBy: { id: "asc" },
    });

    const bestName = new Map<string, string>();
    for (const row of rows) {
      const key = JSON.stringify([row.provider, row.providerUserId]);
      if (hasLetter(row.displayName) && !bestName.has(key)) bestName.set(key, row.displayName);
    }

    return bestName;
  }

  private async resolveParticipantNamesAcrossThreads<T extends MappedThreadRow>(threads: T[]): Promise<void> {
    const unnamed = threads.flatMap((thread) =>
      thread.participants.flatMap((participant) =>
        participant.attendeeId && !hasLetter(participant.displayName)
          ? [
              {
                provider: thread.provider,
                providerUserId: participant.attendeeId,
              },
            ]
          : [],
      ),
    );
    const bestName = await this.resolveBestNamesByProviderUserId(unnamed);

    for (const thread of threads) {
      const single = thread.type === MessagingThreadType.single;
      for (const p of thread.participants) {
        if (hasLetter(p.displayName)) continue;
        const better =
          bestName.get(JSON.stringify([thread.provider, p.attendeeId])) ||
          (single && !p.isSelf && hasLetter(thread.name) ? thread.name : "");
        if (better) p.displayName = better;
      }
    }
  }

  private async recordInboxQuery(params: GetQueryParams) {
    const [model, policy] = await Promise.all([this.inboxRecords.getModel(), this.inboxPolicy.load()]);
    if (!policy.actor) throw unwindFailure(CustomErrorCode.permissionDenied);
    return compileMessagingRecordQuery(
      this.companyId,
      this.userId,
      params,
      model,
      policy.access(model.types.map((type) => type.id)),
    );
  }

  async getItems(params: GetQueryParams) {
    const query = await this.recordInboxQuery(params);
    const take = params.take ?? params.pagination?.pageSize;
    const skip = params.skip ?? (params.pagination ? (params.pagination.page - 1) * params.pagination.pageSize : 0);
    if (
      (take !== undefined && (!Number.isInteger(take) || take < 1 || take > 1000)) ||
      !Number.isInteger(skip) ||
      skip < 0
    )
      throw unwindFailure(CustomErrorCode.recordCalculationBudget);
    const direction = params.sortDescriptor?.direction === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    const selected = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT thread.id ${query}
      ORDER BY thread."lastMessageAt" ${direction} NULLS LAST, thread.id ${direction} LIMIT ${take ?? 1001} OFFSET ${skip}`);
    if (take === undefined && selected.length > 1000) throw unwindFailure(CustomErrorCode.recordCalculationBudget);
    const rows = await this.prisma.messagingThread.findMany({
      where: {
        companyId: this.companyId,
        id: { in: selected.map((row) => row.id) },
      },
      select: this.threadSelect,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return this.mapThreadRows(
      selected.flatMap(({ id }) => {
        const row = byId.get(id);
        return row ? [row] : [];
      }),
    );
  }

  async getCount(params: GetQueryParams) {
    const query = await this.recordInboxQuery(params);
    const rows = await this.prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`SELECT COUNT(*) AS count ${query}`);
    return Number(rows[0]?.count ?? 0);
  }

  @BypassTenantGuard
  async upsertChatThreadUnscoped(
    args: RepoArgs<MessagingIngestRepo, "upsertChatThreadUnscoped"> & {
      markUnread?: boolean;
    },
  ) {
    const unipileThreadId = await this.resolveThreadIdByAlt(args.connectedAccountId, args.unipileThreadId);
    const preview =
      typeof args.lastMessagePreview === "string"
        ? threadPreviewFrom(args.lastMessagePreview)
        : args.lastMessagePreview;

    if (args.unipileThreadAltId) {
      const altMatch = await this.prisma.messagingThread.findFirst({
        where: {
          connectedAccountId: args.connectedAccountId,
          unipileThreadAltId: args.unipileThreadAltId,
        },
        select: { id: true, unipileThreadId: true },
      });

      if (altMatch && altMatch.unipileThreadId !== unipileThreadId) {
        await this.prisma.messagingThread.update({
          where: { id: altMatch.id },
          data: { unipileThreadId },
        });
      }
    }

    const row = await this.prisma.messagingThread.upsert({
      where: {
        connectedAccountId_unipileThreadId: {
          connectedAccountId: args.connectedAccountId,
          unipileThreadId,
        },
      },
      create: {
        companyId: args.companyId,
        connectedAccountId: args.connectedAccountId,
        unipileThreadId,
        unipileThreadAltId: args.unipileThreadAltId ?? null,
        provider: args.provider,
        subject: args.subject,
        lastMessageAt: args.lastMessageAt ?? null,
        lastMessagePreview: preview ?? null,
        lastMessageIsSender: args.lastMessageIsSender ?? null,
        type: args.type,
        name: args.name,
        state: args.markUnread ? "unread" : "open",
      },
      update: {
        companyId: args.companyId,
        subject: args.subject ?? undefined,
        type: args.type ?? undefined,
        name: args.name ?? undefined,
        unipileThreadAltId: args.unipileThreadAltId ?? undefined,
      },
      select: { id: true },
    });

    if (args.markUnread) {
      await this.prisma.messagingThread.updateMany({
        where: { id: row.id },
        data: { state: "unread" },
      });
    }

    await this.upsertThreadParticipantsUnscoped({
      messagingThreadId: row.id,
      companyId: args.companyId,
      provider: args.provider,
      participants: args.participants,
    });

    if (args.lastMessageAt) {
      await this.prisma.messagingThread.updateMany({
        where: {
          id: row.id,
          OR: [
            { lastMessageAt: null },
            { lastMessageAt: { lt: args.lastMessageAt } },
            { lastMessageAt: args.lastMessageAt, lastMessagePreview: null },
          ],
        },
        data: {
          lastMessageAt: args.lastMessageAt,
          ...(preview !== undefined ? { lastMessagePreview: preview } : {}),
          ...(args.lastMessageIsSender !== undefined ? { lastMessageIsSender: args.lastMessageIsSender } : {}),
        },
      });
    }

    if (args.unipileThreadAltId)
      await this.absorbAliasThreadShell(row.id, args.connectedAccountId, args.unipileThreadAltId);

    return row;
  }

  @BypassTenantGuard
  async findThreadLatestMessageAtUnscoped(args: { connectedAccountId: string; unipileThreadId: string }) {
    const row = await this.prisma.messagingThread.findUnique({
      where: {
        connectedAccountId_unipileThreadId: {
          connectedAccountId: args.connectedAccountId,
          unipileThreadId: args.unipileThreadId,
        },
      },
      select: {
        messages: {
          where: { isHidden: false, isDraft: false },
          orderBy: { sentAt: "desc" },
          take: 1,
          select: { sentAt: true },
        },
      },
    });

    return row?.messages[0]?.sentAt ?? null;
  }

  private async resolveThreadIdByAlt(connectedAccountId: string, unipileThreadId: string): Promise<string> {
    if (!unipileThreadId.endsWith("@lid")) return unipileThreadId;

    const match = await this.prisma.messagingThread.findFirst({
      where: { connectedAccountId, unipileThreadAltId: unipileThreadId },
      select: { unipileThreadId: true },
    });

    return match?.unipileThreadId ?? unipileThreadId;
  }

  private async absorbAliasThreadShell(canonicalThreadId: string, connectedAccountId: string, altThreadId: string) {
    const shell = await this.prisma.messagingThread.findFirst({
      where: { connectedAccountId, unipileThreadId: altThreadId },
      select: { id: true },
    });
    if (!shell || shell.id === canonicalThreadId) return;

    await this.prisma.messagingMessage.updateMany({
      where: { messagingThreadId: shell.id },
      data: { messagingThreadId: canonicalThreadId },
    });
    await this.prisma.messagingThread.delete({ where: { id: shell.id } });
  }

  @BypassTenantGuard
  async upsertThreadParticipantsUnscoped(args: RepoArgs<ResyncThreadRepo, "upsertThreadParticipantsUnscoped">) {
    const usable = args.participants.filter((p) => p.attendeeId.trim());
    const nonSelf = usable.filter((p) => !p.isSelf);

    if (nonSelf.length > 0) {
      const selfIdentifiers = usable.flatMap((p) => (p.isSelf && p.identifier ? [p.identifier] : []));
      if (selfIdentifiers.length > 0) {
        await this.prisma.messagingThreadParticipant.deleteMany({
          where: {
            messagingThreadId: args.messagingThreadId,
            identifier: { in: selfIdentifiers },
          },
        });
      }
    }

    const participants = dedupeParticipants(nonSelf.length > 0 ? nonSelf : usable);
    if (participants.length === 0) return;

    await retryOnUniqueConflict(() =>
      this.writeThreadParticipants(args.messagingThreadId, args.companyId, args.provider, participants),
    );
  }

  private async writeThreadParticipants(
    messagingThreadId: string,
    companyId: string,
    provider: MessagingProvider,
    participants: MessagingAttendee[],
  ) {
    const identifiers = participants.map((p) => p.identifier).filter(Boolean);
    const existing = identifiers.length
      ? await this.prisma.messagingThreadParticipant.findMany({
          where: {
            companyId,
            messagingThreadId,
            identifier: { in: identifiers },
          },
          select: { identifier: true, displayName: true, providerUserId: true },
        })
      : [];
    const priorByIdentifier = new Map(existing.map((row) => [row.identifier, row]));
    const handledIdentifiers = new Set<string>();

    for (const p of participants) {
      if (p.identifier) {
        if (handledIdentifiers.has(p.identifier)) continue;
        handledIdentifiers.add(p.identifier);
      }

      const prior = p.identifier ? priorByIdentifier.get(p.identifier) : undefined;
      const priorName = prior?.displayName;
      const displayName = hasLetter(p.displayName)
        ? p.displayName
        : hasLetter(priorName)
          ? priorName
          : (p.displayName ?? null);

      if (prior && prior.providerUserId !== p.attendeeId) {
        await this.prisma.messagingThreadParticipant.update({
          where: {
            messagingThreadId_providerUserId: {
              messagingThreadId,
              providerUserId: prior.providerUserId,
            },
          },
          data: {
            identityLookupValue: identityLookupValue(provider, p.identifier),
            displayName: displayName ?? undefined,
            pictureUrl: p.pictureUrl ?? undefined,
            profileUrl: p.profileUrl ?? undefined,
            headline: p.headline ?? undefined,
            occupation: p.occupation ?? undefined,
          },
        });
        continue;
      }

      await this.prisma.messagingThreadParticipant.upsert({
        where: {
          messagingThreadId_providerUserId: {
            messagingThreadId,
            providerUserId: p.attendeeId,
          },
        },
        create: {
          companyId,
          messagingThreadId,
          provider,
          providerUserId: p.attendeeId,
          identifier: p.identifier || null,
          identityLookupValue: identityLookupValue(provider, p.identifier),
          displayName,
          pictureUrl: p.pictureUrl ?? null,
          profileUrl: p.profileUrl ?? null,
          headline: p.headline ?? null,
          occupation: p.occupation ?? null,
          isSelf: p.isSelf ?? false,
        },
        update: {
          companyId,
          identifier: p.identifier || undefined,
          identityLookupValue: p.identifier ? identityLookupValue(provider, p.identifier) : undefined,
          displayName: displayName ?? undefined,
          pictureUrl: p.pictureUrl ?? undefined,
          profileUrl: p.profileUrl ?? undefined,
          headline: p.headline ?? undefined,
          occupation: p.occupation ?? undefined,
          isSelf: p.isSelf ? true : undefined,
        },
      });
    }
  }

  async setThreadState(args: RepoArgs<UpdateThreadRepo, "setThreadState">) {
    const { threadId, state } = args;

    await this.prisma.messagingThread.updateMany({
      where: {
        id: threadId,
        ...threadAccessWhere(this.companyId, this.userId),
      },
      data: { state },
    });
  }

  async setThreadSharedToCrm(args: RepoArgs<UpdateThreadRepo, "setThreadSharedToCrm">) {
    const { threadId, shared } = args;

    await this.prisma.messagingThread.updateMany({
      where: {
        id: threadId,
        companyId: this.companyId,
        connectedAccount: { is: { userId: this.userId } },
      },
      data: { sharedToCrm: shared },
    });
  }

  async findThreadByIdOrThrow(id: string) {
    const row = await this.prisma.messagingThread.findFirstOrThrow({
      where: { id, ...threadAccessWhere(this.companyId, this.userId) },
      select: this.threadSelect,
    });

    const [hydrated] = await this.mapThreadRows([row]);
    return hydrated;
  }

  async findThreadById(id: string) {
    const row = await this.prisma.messagingThread.findFirst({
      where: { id, ...threadAccessWhere(this.companyId, this.userId) },
      select: this.threadSelect,
    });
    if (!row) return null;

    const [hydrated] = await this.mapThreadRows([row]);
    return hydrated;
  }

  async findThreadForResync(threadId: string) {
    const row = await this.prisma.messagingThread.findFirst({
      where: {
        id: threadId,
        ...threadAccessWhere(this.companyId, this.userId),
        connectedAccount: { is: accessibleConnectedAccountWhere(this.companyId, this.userId) },
      },
      select: {
        id: true,
        unipileThreadId: true,
        connectedAccountId: true,
        provider: true,
        type: true,
        companyId: true,
        connectedAccount: {
          select: {
            unipileAccountId: true,
            emailAddress: true,
            sentFolderIds: true,
          },
        },
      },
    });

    if (!row) return null;
    const { connectedAccount, ...rest } = row;

    return {
      ...rest,
      unipileAccountId: connectedAccount.unipileAccountId,
      emailAddress: connectedAccount.emailAddress,
      sentFolderIds: connectedAccount.sentFolderIds,
    };
  }

  async findThreadIds(ids: Set<string>) {
    if (ids.size === 0) return new Set<string>();

    const threads = await this.prisma.messagingThread.findMany({
      where: {
        id: { in: Array.from(ids) },
        ...threadAccessWhere(this.companyId, this.userId),
      },
      select: { id: true },
    });

    return new Set(threads.map((thread) => thread.id));
  }

  private async mapThreadRows(rows: ThreadRow[]) {
    const draftLed = rows.filter((row) => row.messages[0]?.isDraft).map((row) => row.id);
    const latestSent = await Promise.all(
      draftLed.map((threadId) =>
        this.prisma.messagingMessage.findFirst({
          where: { messagingThreadId: threadId, companyId: this.companyId, isDraft: false, isHidden: false },
          orderBy: [{ sentAt: "desc" }, { id: "desc" }],
          select: { direction: true },
        }),
      ),
    );
    const sentFromSelfBehindDraft = new Map(
      draftLed.map((threadId, index) => {
        const sent = latestSent[index];
        return [threadId, sent ? sent.direction === MessagingMessageDirection.outbound : null] as const;
      }),
    );

    return this.hydrateThreadContacts(rows.map((row) => this.mapThreadRow(row, sentFromSelfBehindDraft.get(row.id))));
  }

  private mapThreadRow(row: ThreadRow, sentFromSelfBehindDraft?: boolean | null) {
    const { messages, participants, connectedAccount, lastMessagePreview, lastMessageIsSender, ...rest } = row;
    const last = messages[0];
    const previewSource =
      last?.isDraft && last.bodyHtml
        ? htmlToPlainText(last.bodyHtml)
        : last?.bodyText?.trim() || htmlToPlainText(htmlWithoutSignature(last?.bodyHtml));
    const derivedPreview = threadPreviewFrom(previewSource);
    const preview = last?.isDeleted
      ? null
      : last?.isDraft && isEmailProvider(row.provider)
        ? derivedPreview
        : (lastMessagePreview ?? derivedPreview);
    const firstAttachment = (last?.attachmentsMeta as unknown as AttachmentMeta[] | null)?.[0];
    const previewKind: PreviewKind | null = last?.isDeleted
      ? "deleted"
      : !preview && firstAttachment
        ? classifyAttachment(firstAttachment)
        : !preview && last && !last.isEvent
          ? "unsupported"
          : null;

    return {
      ...rest,
      unipileThreadId: isDraftThreadId(row.unipileThreadId) ? `${DRAFT_THREAD_PREFIX}${row.id}` : row.unipileThreadId,
      accountShared: connectedAccount.shared,
      isOwner: connectedAccount.userId === this.userId,
      participants: participants.map(({ providerUserId, identifier, ...attendee }) => ({
        ...attendee,
        identifier: identifier ?? "",
        attendeeId: providerUserId,
        records: [] as RecordIdentityReference[],
      })),
      preview,
      previewKind,
      lastMessageFromSelf: last
        ? last.direction === MessagingMessageDirection.outbound
        : (lastMessageIsSender ?? false),
      lastSentMessageFromSelf: last?.isDraft
        ? (sentFromSelfBehindDraft ?? null)
        : last
          ? last.direction === MessagingMessageDirection.outbound
          : (lastMessageIsSender ?? false),
      lastMessageSenderName: (last?.sender as unknown as MessagingAttendee | null)?.displayName?.trim() || null,
      lastMessageSenderIdentifier: (last?.sender as unknown as MessagingAttendee | null)?.identifier ?? null,
    };
  }

  async countUnreadThreadsForCurrentUser() {
    const folderStates = await this.prisma.connectedAccount.findMany({
      where: accessibleFolderStatesWhere(this.companyId, this.userId),
      select: { id: true, selectedFolderIds: true },
    });
    return this.prisma.messagingThread.count({
      where: {
        state: "unread",
        ...inboxThreadVisibilityWhere(
          this.companyId,
          this.userId,
          folderStates.map((row) => ({
            id: row.id,
            visibleSet: row.selectedFolderIds,
          })),
        ),
      },
    });
  }

  async findLatestEmailReplyReferenceForThread(threadId: string) {
    const row = await this.prisma.messagingMessage.findFirst({
      where: {
        messagingThreadId: threadId,
        companyId: this.companyId,
        isDraft: false,
        providerMessageId: { not: null },
        thread: threadAccessWhere(this.companyId, this.userId),
      },
      orderBy: { sentAt: "desc" },
      select: { providerMessageId: true },
    });

    return row?.providerMessageId ?? null;
  }

  async findSelfAttendeeForThread(threadId: string) {
    const participant = await this.prisma.messagingThreadParticipant.findFirst({
      where: {
        messagingThreadId: threadId,
        companyId: this.companyId,
        isSelf: true,
        thread: threadAccessWhere(this.companyId, this.userId),
      },
      select: this.participantSelect,
    });

    if (!participant) return null;

    const { providerUserId, identifier, ...rest } = participant;

    return {
      ...rest,
      identifier: identifier ?? "",
      attendeeId: providerUserId ?? "",
      records: [],
    };
  }

  private async createDraftThread(args: {
    connectedAccountId: string;
    provider: MessagingProvider;
    recipients: string[];
  }) {
    const recipients = normalizeDraftThreadRecipients(args.provider, args.recipients);
    if (!recipients) throw new Error("Cannot create a draft thread for an invalid recipient");
    const row = await this.prisma.messagingThread.create({
      data: {
        companyId: this.companyId,
        connectedAccountId: args.connectedAccountId,
        provider: args.provider,
        unipileThreadId: newDraftThreadProviderId(),
        type: recipients.length > 1 ? MessagingThreadType.group : MessagingThreadType.single,
        state: MessagingThreadState.open,
        participants: {
          create: recipients.map((identifier) => ({
            companyId: this.companyId,
            provider: args.provider,
            providerUserId: identifier,
            identifier,
            identityLookupValue: identityLookupValue(args.provider, identifier),
          })),
        },
      },
      select: { id: true },
    });
    return row.id;
  }

  async createConversationDraftOrThrow(args: {
    connectedAccountId: string;
    provider: MessagingProvider;
    sender: MessagingAttendee;
    subject: string | null;
    bodyText: string;
    bodyHtml?: string | null;
    recipients: {
      to: MessagingAttendee[];
      cc: MessagingAttendee[];
      bcc: MessagingAttendee[];
    };
  }) {
    return this.withCompanyTransaction(this.companyId, async () => {
      const threadId = await this.createDraftThread({
        connectedAccountId: args.connectedAccountId,
        provider: args.provider,
        recipients: args.recipients.to.map((recipient) => recipient.identifier),
      });
      return this.upsertThreadDraftOrThrow({ ...args, threadId });
    });
  }

  private async refreshDraftParticipantKeys(threadId: string, provider: MessagingProvider): Promise<void> {
    const participants = await this.prisma.messagingThreadParticipant.findMany({
      where: { companyId: this.companyId, messagingThreadId: threadId, provider, isSelf: false },
      select: { id: true, identifier: true, identityLookupValue: true, updatedAt: true },
    });
    for (const participant of participants) {
      const lookup = identityLookupValue(provider, participant.identifier);
      if (participant.identityLookupValue === lookup) continue;
      await this.prisma.messagingThreadParticipant.updateMany({
        where: { id: participant.id, companyId: this.companyId, messagingThreadId: threadId, provider },
        data: { identityLookupValue: lookup, updatedAt: participant.updatedAt },
      });
    }
  }

  async upsertThreadDraftOrThrow(args: {
    threadId: string;
    connectedAccountId: string;
    provider: MessagingProvider;
    sender: MessagingAttendee;
    subject: string | null;
    bodyText: string;
    bodyHtml?: string | null;
    recipients: {
      to: MessagingAttendee[];
      cc: MessagingAttendee[];
      bcc: MessagingAttendee[];
    };
  }) {
    return this.withCompanyTransaction(this.companyId, async () => {
      const thread = await this.prisma.messagingThread.findFirstOrThrow({
        where: {
          id: args.threadId,
          ...threadAccessWhere(this.companyId, this.userId),
          connectedAccount: { is: accessibleConnectedAccountWhere(this.companyId, this.userId) },
        },
        select: { id: true, unipileThreadId: true },
      });
      if (isDraftThreadId(thread.unipileThreadId)) await this.refreshDraftParticipantKeys(thread.id, args.provider);

      const now = new Date();
      const unipileMessageId = draftMessageProviderId(args.threadId);
      const messageData = {
        sender: args.sender,
        senderIdentifier: args.sender.identifier || null,
        recipients: args.recipients,
        subject: args.subject,
        bodyText: args.bodyText,
        bodyHtml: args.bodyHtml ?? null,
        isDraft: true,
        sentAt: now,
      } satisfies Prisma.MessagingMessageUpdateInput;
      const existingDrafts = await this.prisma.messagingMessage.findMany({
        where: {
          messagingThreadId: args.threadId,
          companyId: this.companyId,
          isDraft: true,
        },
        orderBy: [{ sentAt: "desc" }, { id: "desc" }],
        select: { id: true, unipileMessageId: true },
      });
      const sends = existingDrafts.length
        ? await this.prisma.messagingDraftSend.findMany({
            where: { companyId: this.companyId, draftMessageId: { in: existingDrafts.map((draft) => draft.id) } },
            select: { draftMessageId: true, state: true, updatedAt: true },
          })
        : [];
      const sendStates = new Map(sends.map((send) => [send.draftMessageId, effectiveDraftSendState(send)]));
      if (existingDrafts.some((draft) => sendStates.get(draft.id) === "sending"))
        throw unwindFailure(CustomErrorCode.draftSendInProgress, "conflict");
      const sentDraftIds = existingDrafts
        .filter((draft) => sendStates.get(draft.id) === "sent")
        .map((draft) => draft.id);
      if (sentDraftIds.length > 0) {
        await this.prisma.messagingMessage.deleteMany({
          where: { id: { in: sentDraftIds }, companyId: this.companyId, isDraft: true },
        });
      }
      const editableDrafts = existingDrafts.filter((draft) => !sentDraftIds.includes(draft.id));
      const existing = editableDrafts.find((draft) => draft.unipileMessageId === unipileMessageId) ?? editableDrafts[0];
      const row = existing
        ? await this.prisma.messagingMessage.update({
            where: { id: existing.id, companyId: this.companyId },
            data: {
              companyId: this.companyId,
              unipileMessageId,
              ...messageData,
            },
          })
        : await this.prisma.messagingMessage.upsert({
            where: {
              companyId: this.companyId,
              connectedAccountId_unipileMessageId: {
                connectedAccountId: args.connectedAccountId,
                unipileMessageId,
              },
            },
            update: { companyId: this.companyId, ...messageData },
            create: {
              companyId: this.companyId,
              messagingThreadId: args.threadId,
              connectedAccountId: args.connectedAccountId,
              unipileMessageId,
              provider: args.provider,
              direction: MessagingMessageDirection.outbound,
              origin: MessagingMessageOrigin.external,
              ...messageData,
            },
          });

      await this.prisma.messagingMessage.deleteMany({
        where: {
          messagingThreadId: args.threadId,
          companyId: this.companyId,
          isDraft: true,
          id: { not: row.id },
        },
      });

      await this.prisma.messagingThread.update({
        where: { id: args.threadId, companyId: this.companyId },
        data: {
          lastMessageAt: now,
          lastMessagePreview: threadPreviewFrom(
            htmlToPlainText(htmlWithoutSignature(args.bodyHtml)) || args.bodyText.trim(),
          ),
          lastMessageIsSender: true,
          ...(isDraftThreadId(thread.unipileThreadId) ? { subject: args.subject } : {}),
        },
      });

      return row as unknown as MessagingMessage;
    });
  }

  async findDraftById(args: { messageId: string }) {
    const draft = await this.prisma.messagingMessage.findFirst({
      where: {
        id: args.messageId,
        companyId: this.companyId,
        isDraft: true,
        thread: threadAccessWhere(this.companyId, this.userId),
      },
      select: {
        id: true,
        messagingThreadId: true,
        connectedAccountId: true,
        updatedAt: true,
        recipients: true,
        thread: {
          select: {
            unipileThreadId: true,
            participants: {
              where: { isSelf: false },
              select: { identifier: true },
            },
          },
        },
      },
    });

    return draft
      ? {
          id: draft.id,
          messagingThreadId: draft.messagingThreadId,
          connectedAccountId: draft.connectedAccountId,
          unipileThreadId: draft.thread.unipileThreadId,
          updatedAt: draft.updatedAt,
          recipientIdentifiers: draft.thread.participants
            .map((participant) => participant.identifier)
            .filter((identifier): identifier is string => Boolean(identifier)),
          ccIdentifiers: (draft.recipients as unknown as MessagingMessage["recipients"]).cc.map(
            (person) => person.identifier,
          ),
          bccIdentifiers: (draft.recipients as unknown as MessagingMessage["recipients"]).bcc.map(
            (person) => person.identifier,
          ),
        }
      : null;
  }

  async findRecentOutboundDuplicate(args: { messagingThreadId: string; bodyText: string; windowMs: number }) {
    const since = new Date(Date.now() - args.windowMs);
    const candidate = await this.prisma.messagingMessage.findFirst({
      where: {
        messagingThreadId: args.messagingThreadId,
        companyId: this.companyId,
        direction: MessagingMessageDirection.outbound,
        isDraft: false,
        bodyText: args.bodyText,
        sentAt: { gte: since },
        thread: threadAccessWhere(this.companyId, this.userId),
      },
      orderBy: { sentAt: "desc" },
      select: { id: true },
    });

    return candidate?.id ?? null;
  }

  async convertDraftToSent(args: ConvertDraftToSentArgs) {
    try {
      return await this.withCompanyTransaction(this.companyId, () => this.convertDraftToSentInCurrentTransaction(args));
    } catch (error) {
      if ((error as { code?: unknown }).code !== "P2002") throw error;
      return this.withCompanyTransaction(this.companyId, () => this.convertDraftToSentInCurrentTransaction(args));
    }
  }

  private async convertDraftToSentInCurrentTransaction(args: ConvertDraftToSentArgs) {
    const draft = await this.prisma.messagingMessage.findFirst({
      where: {
        id: args.messageId,
        companyId: this.companyId,
        isDraft: true,
        thread: threadAccessWhere(this.companyId, this.userId),
      },
      select: { id: true, messagingThreadId: true, connectedAccountId: true },
    });

    if (!draft) return null;

    let row = await this.prisma.messagingMessage.findFirst({
      where: {
        companyId: this.companyId,
        connectedAccountId: draft.connectedAccountId,
        isDraft: false,
        OR: [
          { unipileMessageId: args.unipileMessageId },
          ...(args.providerMessageId ? [{ providerMessageId: args.providerMessageId }] : []),
        ],
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    if (!row) {
      const converted = await this.prisma.messagingMessage.updateMany({
        where: {
          id: draft.id,
          companyId: this.companyId,
          isDraft: true,
          updatedAt: args.expectedUpdatedAt,
        },
        data: {
          unipileMessageId: args.unipileMessageId,
          providerMessageId: args.providerMessageId,
          origin: MessagingMessageOrigin.unipile,
          isDraft: false,
          sender: args.sender,
          senderIdentifier: args.sender.identifier || null,
          recipients: args.recipients,
          subject: args.subject,
          bodyText: args.bodyText,
          bodyHtml: args.bodyHtml,
          ...(args.attachmentsMeta?.length ? { attachmentsMeta: args.attachmentsMeta } : {}),
          sentAt: args.sentAt,
        },
      });
      if (converted.count === 0) return null;

      row = await this.prisma.messagingMessage.findFirstOrThrow({
        where: { id: draft.id, companyId: this.companyId, isDraft: false },
      });
    }

    if (row.id !== draft.id) {
      const deleted = await this.prisma.messagingMessage.deleteMany({
        where: {
          id: draft.id,
          companyId: this.companyId,
          isDraft: true,
          updatedAt: args.expectedUpdatedAt,
        },
      });
      if (deleted.count === 0) {
        await this.refreshThreadSummaryAfterCommit(draft.messagingThreadId);
        return row as unknown as MessagingMessage;
      }
      await this.deleteEmptyDraftThreadShell(draft.messagingThreadId);
    }

    const affectedThreadIds = new Set([draft.messagingThreadId, row.messagingThreadId]);
    for (const threadId of affectedThreadIds) await this.refreshThreadSummaryAfterCommit(threadId);

    return row as unknown as MessagingMessage;
  }

  private get draftSendSelect() {
    return {
      id: true,
      draftMessageId: true,
      draftRevision: true,
      connectedAccountId: true,
      state: true,
      unipileMessageId: true,
      providerMessageId: true,
      sentMessageId: true,
      sentThreadId: true,
      contentHash: true,
      updatedAt: true,
    } as const;
  }

  async findDraftSend(args: { draftMessageId: string }): Promise<DraftSendRecord | null> {
    return this.prisma.messagingDraftSend.findFirst({
      where: {
        companyId: this.companyId,
        draftMessageId: args.draftMessageId,
        connectedAccount: { is: accessibleConnectedAccountWhere(this.companyId, this.userId) },
      },
      select: this.draftSendSelect,
    });
  }

  async beginDraftSend(args: {
    draftMessageId: string;
    draftRevision: Date;
    connectedAccountId: string;
    contentHash: string;
  }): Promise<DraftSendStart> {
    return this.withCompanyTransaction(this.companyId, async () => {
      const draft = await this.prisma.messagingMessage.findFirst({
        where: {
          id: args.draftMessageId,
          companyId: this.companyId,
          isDraft: true,
          thread: threadAccessWhere(this.companyId, this.userId),
        },
        select: { updatedAt: true },
      });
      const record = await this.prisma.messagingDraftSend.findFirst({
        where: { companyId: this.companyId, draftMessageId: args.draftMessageId },
        select: this.draftSendSelect,
      });

      if (!draft) {
        const missing = decideMissingDraftSend(record, args.draftRevision, args.contentHash);
        if (missing === "replay" && record) return { status: "replay" as const, record };
        return { status: missing === "replay" ? ("not_found" as const) : missing };
      }
      if (draft.updatedAt.getTime() !== args.draftRevision.getTime()) return { status: "changed" as const };

      const decision = decideDraftSend(record, args.draftRevision, args.contentHash);
      if (decision === "replay" && record) {
        await this.deleteDraftInCurrentTransaction({
          messageId: args.draftMessageId,
          expectedUpdatedAt: args.draftRevision,
        });
        return { status: "replay" as const, record };
      }
      if (decision === "in_progress") return { status: "in_progress" as const };
      if (decision === "outcome_unknown") return { status: "outcome_unknown" as const };
      if (decision === "already_sent") return { status: "already_sent" as const };

      if (decision === "take_over" && record) {
        const taken = await this.prisma.messagingDraftSend.updateMany({
          where: {
            id: record.id,
            companyId: this.companyId,
            state: record.state,
            draftRevision: record.draftRevision,
          },
          data: {
            state: MessagingDraftSendState.sending,
            draftRevision: args.draftRevision,
            contentHash: args.contentHash,
            unipileMessageId: null,
            providerMessageId: null,
            sentMessageId: null,
            sentThreadId: null,
          },
        });
        return taken.count === 1
          ? { status: "claimed" as const, claim: { id: record.id, draftRevision: args.draftRevision } }
          : { status: "in_progress" as const };
      }

      const created = await this.prisma.messagingDraftSend.create({
        data: {
          companyId: this.companyId,
          connectedAccountId: args.connectedAccountId,
          draftMessageId: args.draftMessageId,
          draftRevision: args.draftRevision,
          contentHash: args.contentHash,
          state: MessagingDraftSendState.sending,
        },
        select: { id: true },
      });
      return { status: "claimed" as const, claim: { id: created.id, draftRevision: args.draftRevision } };
    });
  }

  async settleDraftSend(args: {
    claim: DraftSendClaim;
    state: "sent" | "unknown";
    unipileMessageId?: string | null;
    providerMessageId?: string | null;
  }) {
    await this.prisma.messagingDraftSend.updateMany({
      where: {
        id: args.claim.id,
        companyId: this.companyId,
        draftRevision: args.claim.draftRevision,
        state: MessagingDraftSendState.sending,
      },
      data: {
        state: args.state,
        ...(args.unipileMessageId !== undefined ? { unipileMessageId: args.unipileMessageId } : {}),
        ...(args.providerMessageId !== undefined ? { providerMessageId: args.providerMessageId } : {}),
      },
    });
  }

  async recordDraftSendResult(args: { claim: DraftSendClaim; sentMessageId: string; sentThreadId: string }) {
    await this.prisma.messagingDraftSend.updateMany({
      where: {
        id: args.claim.id,
        companyId: this.companyId,
        draftRevision: args.claim.draftRevision,
        state: MessagingDraftSendState.sent,
      },
      data: { sentMessageId: args.sentMessageId, sentThreadId: args.sentThreadId },
    });
  }

  async releaseDraftSend(args: { claim: DraftSendClaim }) {
    await this.prisma.messagingDraftSend.deleteMany({
      where: {
        id: args.claim.id,
        companyId: this.companyId,
        draftRevision: args.claim.draftRevision,
        state: MessagingDraftSendState.sending,
      },
    });
  }

  @BypassTenantGuard
  async pruneDraftSendsUnscoped(args: { before: Date; after: string | null; limit: number }) {
    const expired = await this.prisma.messagingDraftSend.findMany({
      where: { updatedAt: { lt: args.before }, ...(args.after ? { id: { gt: args.after } } : {}) },
      orderBy: { id: "asc" },
      take: args.limit,
      select: { id: true, companyId: true, draftMessageId: true },
    });
    const sendsByCompany = new Map<string, typeof expired>();
    for (const send of expired)
      sendsByCompany.set(send.companyId, [...(sendsByCompany.get(send.companyId) ?? []), send]);
    let pruned = 0;

    for (const [companyId, sends] of sendsByCompany) {
      pruned += await this.withCompanyTransaction(companyId, async () => {
        const drafts = await this.prisma.messagingMessage.findMany({
          where: { id: { in: sends.map((send) => send.draftMessageId) }, companyId, isDraft: true },
          select: { id: true },
        });
        const draftIds = new Set(drafts.map((draft) => draft.id));
        const prunable = sends.filter((send) => !draftIds.has(send.draftMessageId)).map((send) => send.id);
        if (prunable.length === 0) return 0;

        const removed = await this.prisma.messagingDraftSend.deleteMany({
          where: { id: { in: prunable }, companyId, updatedAt: { lt: args.before } },
        });
        return removed.count;
      });
    }

    return { pruned, next: expired.length === args.limit ? (expired.at(-1)?.id ?? null) : null };
  }

  async completeDraftSendRemovingDraft(args: {
    claim: DraftSendClaim;
    draftMessageId: string;
    unipileMessageId: string | null;
    providerMessageId: string | null;
  }) {
    await this.withCompanyTransaction(this.companyId, async () => {
      await this.settleDraftSend({
        claim: args.claim,
        state: "sent",
        unipileMessageId: args.unipileMessageId,
        providerMessageId: args.providerMessageId,
      });
      await this.deleteDraftInCurrentTransaction({
        messageId: args.draftMessageId,
        expectedUpdatedAt: args.claim.draftRevision,
      });
    });
  }

  async completeReplyDraftSend(args: Omit<ConvertDraftToSentArgs, "expectedUpdatedAt"> & { claim: DraftSendClaim }) {
    const conversion = { ...args, expectedUpdatedAt: args.claim.draftRevision };
    const complete = () =>
      this.withCompanyTransaction(this.companyId, async () => {
        await this.settleDraftSend({
          claim: args.claim,
          state: "sent",
          unipileMessageId: args.unipileMessageId,
          providerMessageId: args.providerMessageId,
        });
        const converted = await this.convertDraftToSentInCurrentTransaction(conversion);
        if (converted) {
          await this.recordDraftSendResult({
            claim: args.claim,
            sentMessageId: converted.id,
            sentThreadId: converted.messagingThreadId,
          });
        }
        return converted;
      });
    try {
      return await complete();
    } catch (error) {
      if ((error as { code?: unknown }).code !== "P2002") throw error;
      return complete();
    }
  }

  async findDraftSendMessage(args: { record: DraftSendRecord; connectedAccountId: string }) {
    const { record } = args;
    const references: Prisma.MessagingMessageWhereInput[] = [
      ...(record.sentMessageId ? [{ id: record.sentMessageId }] : []),
      ...(record.unipileMessageId
        ? [{ connectedAccountId: args.connectedAccountId, unipileMessageId: record.unipileMessageId }]
        : []),
      ...(record.providerMessageId
        ? [{ connectedAccountId: args.connectedAccountId, providerMessageId: record.providerMessageId }]
        : []),
    ];
    if (references.length === 0) return null;
    const row = await this.prisma.messagingMessage.findFirst({
      where: {
        companyId: this.companyId,
        isDraft: false,
        OR: references,
        thread: threadAccessWhere(this.companyId, this.userId),
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return row as unknown as MessagingMessage | null;
  }

  async deleteDraft(args: { messageId: string; expectedUpdatedAt: Date }): Promise<DraftDeleteResult> {
    return this.withCompanyTransaction(this.companyId, async () => {
      const send = await this.prisma.messagingDraftSend.findFirst({
        where: {
          companyId: this.companyId,
          draftMessageId: args.messageId,
          connectedAccount: { is: accessibleConnectedAccountWhere(this.companyId, this.userId) },
        },
        select: { state: true, updatedAt: true },
      });
      if (send && effectiveDraftSendState(send) === "sending") return { status: "send_in_progress" as const };
      return this.deleteDraftInCurrentTransaction(args);
    });
  }

  async restoreDraftSummaryIfPresent(args: { messageId: string }) {
    await this.withCompanyTransaction(this.companyId, async () => {
      const draft = await this.prisma.messagingMessage.findFirst({
        where: {
          id: args.messageId,
          companyId: this.companyId,
          isDraft: true,
          thread: threadAccessWhere(this.companyId, this.userId),
        },
        select: { messagingThreadId: true },
      });

      if (draft) await this.refreshThreadSummary(draft.messagingThreadId, true);
    });
  }

  private async deleteDraftInCurrentTransaction(args: {
    messageId: string;
    expectedUpdatedAt: Date;
  }): Promise<DraftDeleteResult> {
    const draft = await this.prisma.messagingMessage.findFirst({
      where: {
        id: args.messageId,
        companyId: this.companyId,
        isDraft: true,
        connectedAccount: { is: accessibleConnectedAccountWhere(this.companyId, this.userId) },
      },
      select: { messagingThreadId: true, updatedAt: true },
    });

    if (!draft) return { status: "not_found" };
    if (!draftRevisionMatches(draft.updatedAt, args.expectedUpdatedAt.toISOString()))
      return { status: "revision_mismatch" };

    const deleted = await this.prisma.messagingMessage.deleteMany({
      where: {
        id: args.messageId,
        companyId: this.companyId,
        isDraft: true,
        updatedAt: args.expectedUpdatedAt,
      },
    });
    if (deleted.count === 0) {
      const current = await this.prisma.messagingMessage.findFirst({
        where: { id: args.messageId, companyId: this.companyId, isDraft: true },
        select: { id: true },
      });
      return { status: current ? "revision_mismatch" : "not_found" };
    }

    await this.deleteEmptyDraftThreadShell(draft.messagingThreadId);
    await this.refreshThreadSummaryAfterCommit(draft.messagingThreadId);

    return { status: "deleted", messagingThreadId: draft.messagingThreadId };
  }

  private async deleteEmptyDraftThreadShell(threadId: string) {
    const thread = await this.prisma.messagingThread.findFirst({
      where: {
        id: threadId,
        companyId: this.companyId,
        messages: { none: {} },
      },
      select: { id: true, unipileThreadId: true },
    });

    if (!thread || !isDraftThreadId(thread.unipileThreadId)) return;

    await this.prisma.messagingThread.deleteMany({
      where: { id: thread.id, companyId: this.companyId },
    });
  }

  private async refreshThreadSummary(threadId: string, preferDraft = false) {
    const thread = await this.prisma.messagingThread.findFirst({
      where: { id: threadId, companyId: this.companyId },
      select: { id: true },
    });
    if (!thread) return;

    const select = {
      sentAt: true,
      bodyText: true,
      bodyHtml: true,
      direction: true,
    } as const;
    const draft = preferDraft
      ? await this.prisma.messagingMessage.findFirst({
          where: {
            messagingThreadId: threadId,
            companyId: this.companyId,
            isDraft: true,
            isHidden: false,
          },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          select,
        })
      : null;
    const latest =
      draft ??
      (await this.prisma.messagingMessage.findFirst({
        where: {
          messagingThreadId: threadId,
          companyId: this.companyId,
          isDraft: false,
          isHidden: false,
        },
        orderBy: [{ sentAt: "desc" }, { id: "desc" }],
        select,
      }));
    const latestOutboundBody =
      latest && latest.direction === MessagingMessageDirection.outbound
        ? htmlToPlainText(htmlWithoutSignature(latest.bodyHtml))
        : null;
    const preview = threadPreviewFrom(
      draft?.bodyHtml
        ? htmlToPlainText(draft.bodyHtml)
        : latestOutboundBody?.trim() || latest?.bodyText?.trim() || htmlToPlainText(latest?.bodyHtml),
    );

    await this.prisma.messagingThread.update({
      where: { id: threadId, companyId: this.companyId },
      data: {
        lastMessageAt: latest?.sentAt ?? null,
        lastMessagePreview: preview,
        lastMessageIsSender: latest ? latest.direction === MessagingMessageDirection.outbound : null,
      },
    });
  }

  private async refreshThreadSummaryAfterCommit(threadId: string) {
    const companyId = this.companyId;
    await this.runAfterCommit(() =>
      this.withCompanyTransaction(companyId, () => this.refreshThreadSummary(threadId, true)),
    );
  }

  async persistOutboundMessageOrThrow(args: { connectedAccountId: string; message: IngestMessage }) {
    const result = await this.ingestMessageUnscoped({
      companyId: this.companyId,
      connectedAccountId: args.connectedAccountId,
      message: args.message,
      backfill: false,
    });

    if (result.isDuplicate) {
      const duplicate = args.message.providerMessageId
        ? await this.prisma.messagingMessage.findFirst({
            where: {
              companyId: this.companyId,
              connectedAccountId: args.connectedAccountId,
              providerMessageId: args.message.providerMessageId,
              isDraft: false,
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          })
        : null;

      if (!duplicate) throw new Error("Outbound message deduplicated without a persisted row");

      return (await this.keepOutboundBcc(duplicate, args.message)) as unknown as MessagingMessage;
    }

    if (!result.isEcho) return this.keepOutboundBcc(result.message, args.message);

    const existing = await this.findMessageByUnipileIdUnscoped({
      connectedAccountId: args.connectedAccountId,
      unipileMessageId: args.message.unipileMessageId,
    });

    if (!existing) throw new Error("Outbound message echoed without a persisted row");

    return (await this.keepOutboundBcc(existing, args.message)) as unknown as MessagingMessage;
  }

  private async keepOutboundBcc<T extends { id: string; recipients: unknown; direction: MessagingMessageDirection }>(
    row: T,
    message: IngestMessage,
  ): Promise<T> {
    const stored = row.recipients as { bcc?: unknown[] } | null;
    if (row.direction !== MessagingMessageDirection.outbound) return row;
    if (message.recipients.bcc.length === 0 || (stored?.bcc?.length ?? 0) > 0) return row;

    const recipients = { ...(stored ?? {}), bcc: message.recipients.bcc };
    await this.prisma.messagingMessage.update({
      where: { id: row.id, companyId: this.companyId },
      data: { recipients: recipients as Prisma.InputJsonValue },
    });
    return { ...row, recipients };
  }

  private async reconcileOutboundChatEcho(args: {
    messagingThreadId: string;
    connectedAccountId: string;
    unipileMessageId: string;
    bodyText: string | null;
    sentAt: Date;
  }) {
    if (!args.bodyText) return false;

    const windowMs = 2 * 60 * 1000;
    const candidate = await this.prisma.messagingMessage.findFirst({
      where: {
        messagingThreadId: args.messagingThreadId,
        connectedAccountId: args.connectedAccountId,
        direction: MessagingMessageDirection.outbound,
        origin: MessagingMessageOrigin.unipile,
        isDraft: false,
        bodyText: args.bodyText,
        sentAt: {
          gte: new Date(args.sentAt.getTime() - windowMs),
          lte: new Date(args.sentAt.getTime() + windowMs),
        },
        NOT: { unipileMessageId: args.unipileMessageId },
      },
      orderBy: { sentAt: "desc" },
      select: { id: true },
    });

    if (!candidate) return false;

    await this.prisma.messagingMessage.update({
      where: { id: candidate.id },
      data: { unipileMessageId: args.unipileMessageId },
    });

    return true;
  }

  async findAttachmentForMessageOrThrow(
    args: RepoArgs<GetMessageAttachmentMetaRepo, "findAttachmentForMessageOrThrow">,
  ) {
    const row = await this.prisma.messagingMessage.findFirstOrThrow({
      where: {
        id: args.messageId,
        companyId: this.companyId,
        thread: threadAccessWhere(this.companyId, this.userId),
      },
      select: {
        unipileMessageId: true,
        provider: true,
        attachmentsMeta: true,
        connectedAccount: { select: { unipileAccountId: true } },
        thread: { select: { unipileThreadId: true } },
      },
    });

    const list = Array.isArray(row.attachmentsMeta)
      ? (row.attachmentsMeta as Array<{
          id: string;
          mime?: string | null;
          fileName?: string | null;
          size?: number | null;
        }>)
      : [];
    const att = list.find((a) => a.id === args.attachmentId);

    return {
      unipileAccountId: row.connectedAccount.unipileAccountId,
      unipileThreadId: row.thread.unipileThreadId,
      unipileMessageId: row.unipileMessageId,
      provider: row.provider,
      mime: att?.mime ?? null,
      fileName: att?.fileName ?? null,
      size: att?.size ?? null,
    };
  }

  async findThreadForMoveOrThrow(threadId: string) {
    const row = await this.prisma.messagingThread.findFirstOrThrow({
      where: {
        id: threadId,
        ...threadAccessWhere(this.companyId, this.userId),
      },
      select: {
        id: true,
        connectedAccountId: true,
        provider: true,
        companyId: true,
        connectedAccount: { select: { unipileAccountId: true } },
      },
    });

    const { connectedAccount, ...rest } = row;

    return { ...rest, unipileAccountId: connectedAccount.unipileAccountId };
  }

  async listThreadMovableMessages(threadId: string) {
    const accessibleThread = await this.prisma.messagingThread.findFirst({
      where: {
        id: threadId,
        ...threadAccessWhere(this.companyId, this.userId),
      },
      select: { id: true },
    });
    if (!accessibleThread) return [];

    return this.prisma.messagingMessage.findMany({
      where: {
        messagingThreadId: threadId,
        companyId: this.companyId,
        isDraft: false,
        isHidden: false,
      },
      select: { id: true, unipileMessageId: true, folderIds: true },
      orderBy: { sentAt: "asc" },
    });
  }

  async listThreadFolderPlacements(threadId: string) {
    const accessibleThread = await this.prisma.messagingThread.findFirst({
      where: {
        id: threadId,
        ...threadAccessWhere(this.companyId, this.userId),
      },
      select: { id: true },
    });
    if (!accessibleThread) return [];

    return this.prisma.messagingMessage.findMany({
      where: {
        messagingThreadId: threadId,
        companyId: this.companyId,
        isHidden: false,
      },
      select: { folderIds: true, sentAt: true },
      orderBy: { sentAt: "desc" },
    });
  }

  async listMessagesForThread(threadId: string, opts?: { page?: number; pageSize?: number }) {
    const accessibleThread = await this.prisma.messagingThread.findFirst({
      where: {
        id: threadId,
        ...threadAccessWhere(this.companyId, this.userId),
      },
      select: {
        id: true,
        connectedAccountId: true,
        provider: true,
        name: true,
        type: true,
        connectedAccount: {
          select: { selectedFolderIds: true, foldersSyncedAt: true, userId: true, shared: true },
        },
      },
    });

    if (!accessibleThread) return { messages: [] as MessagingMessage[], total: 0 };

    const account = accessibleThread.connectedAccount;
    const canViewBcc = canViewAccountMessages(account, this.userId);
    const folderStates =
      account.foldersSyncedAt !== null
        ? [
            {
              id: accessibleThread.connectedAccountId,
              visibleSet: account.selectedFolderIds,
            },
          ]
        : [];
    const where = {
      messagingThreadId: threadId,
      connectedAccountId: accessibleThread.connectedAccountId,
      companyId: this.companyId,
      ...messageVisibilityWhere(folderStates),
    };
    const pageSize = opts?.pageSize;

    if (pageSize === undefined) {
      const rows = await this.prisma.messagingMessage.findMany({
        where,
        orderBy: { sentAt: "asc" },
      });
      const messages = redactMessageBcc(
        limitMessageFolderIds(rows, canViewBcc, folderStates),
        canViewBcc,
      ) as unknown as MessagingMessage[];
      await this.hydrateMessageSenderContacts(messages, accessibleThread);

      return { messages, total: messages.length };
    }

    const page = opts?.page ?? 1;
    const total = await this.prisma.messagingMessage.count({ where });
    const rows = await this.prisma.messagingMessage.findMany({
      where,
      orderBy: [{ sentAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const messages = (
      redactMessageBcc(
        limitMessageFolderIds(rows, canViewBcc, folderStates),
        canViewBcc,
      ) as unknown as MessagingMessage[]
    ).reverse();
    await this.hydrateMessageSenderContacts(messages, accessibleThread);

    return { messages, total };
  }

  private async hydrateMessageSenderContacts(
    messages: MessagingMessage[],
    thread: {
      provider: MessagingProvider;
      name: string | null;
      type: MessagingThreadType;
    },
  ) {
    const { provider } = thread;
    const attendees = messages.flatMap((message) => [
      message.sender,
      ...message.recipients.to,
      ...message.recipients.cc,
      ...message.recipients.bcc,
    ]);
    const pairs = [...new Set(attendees.map((attendee) => attendee.identifier.trim()).filter(Boolean))].map(
      (value) => ({ provider, value }),
    );
    const contactByKey = pairs.length > 0 ? await this.resolveContactsByIdentifiers(pairs) : null;

    const unnamed = new Set<string>();
    for (const message of messages) {
      if (!message.sender.isSelf && message.sender.attendeeId && !hasLetter(message.sender.displayName))
        unnamed.add(message.sender.attendeeId);
    }
    const bestName = await this.resolveBestNamesByProviderUserId(
      [...unnamed].map((providerUserId) => ({ provider, providerUserId })),
    );
    const single = thread.type === MessagingThreadType.single;

    for (const attendee of attendees) {
      delete (attendee as MessagingAttendee & { contact?: unknown }).contact;
      delete (attendee as MessagingAttendee & { record?: unknown }).record;
      attendee.records = contactByKey?.get(identifierKey(provider, attendee.identifier.trim())) ?? [];
    }
    messages.forEach((message) => {
      if (message.sender.isSelf || hasLetter(message.sender.displayName)) return;
      const better =
        bestName.get(JSON.stringify([provider, message.sender.attendeeId])) ||
        (single && hasLetter(thread.name) ? thread.name : "");
      if (better) message.sender.displayName = better;
    });
  }

  private async resolveContactsByIdentifiers(
    pairs: { provider: MessagingProvider; value: string }[],
  ): Promise<Map<string, RecordIdentityReference[]>> {
    if (!this.identities) throw new Error("Messaging record identities are not configured");
    const matches = await this.identities.resolve(pairs);
    return new Map(matches.map((match) => [identifierKey(match.provider, match.value), match.records]));
  }

  @BypassTenantGuard
  async ingestMessageUnscoped({
    companyId,
    connectedAccountId,
    message,
    backfill,
  }: RepoArgs<MessagingIngestRepo, "ingestMessageUnscoped">) {
    const existing = await this.findMessageByUnipileIdUnscoped({
      connectedAccountId,
      unipileMessageId: message.unipileMessageId,
    });

    const isInbound = message.direction === MessagingMessageDirection.inbound;
    const safeMessage = sanitizeMessage(message);

    if (existing && !isInbound && message.origin === MessagingMessageOrigin.unipile) {
      if (safeMessage.attachmentsMeta.length > 0 && existing.attachmentsMeta.length === 0) {
        await this.prisma.messagingMessage.update({
          where: { id: existing.id },
          data: { attachmentsMeta: safeMessage.attachmentsMeta },
        });
      }
      return { isEcho: true as const };
    }

    if (!existing && safeMessage.providerMessageId && isEmailProvider(safeMessage.provider)) {
      const duplicate = await this.prisma.messagingMessage.findFirst({
        where: {
          connectedAccountId,
          providerMessageId: safeMessage.providerMessageId,
          isDraft: false,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, folderIds: true, sender: true },
      });

      if (duplicate) {
        const duplicateSender = duplicate.sender as unknown as MessagingAttendee;
        const upgradeSender = hasLetter(safeMessage.sender.displayName) && !hasLetter(duplicateSender.displayName);
        const incomingFolderIds = safeMessage.folderIds ?? [];
        const folderIds =
          backfill || incomingFolderIds.length === 0
            ? [...new Set([...duplicate.folderIds, ...incomingFolderIds])]
            : incomingFolderIds;

        await this.prisma.messagingMessage.update({
          where: { id: duplicate.id },
          data: {
            folderIds,
            unipileMessageId: safeMessage.unipileMessageId,
            ...(folderIds.length > 0 ? { isHidden: false } : {}),
            ...(upgradeSender
              ? {
                  sender: safeMessage.sender as unknown as Prisma.InputJsonValue,
                }
              : {}),
          },
        });

        return { isEcho: false as const, isDuplicate: true as const };
      }
    }

    const { unipileThreadId, threadType, previewText, ...messageFields } = safeMessage;

    const outboundBody =
      safeMessage.direction === MessagingMessageDirection.outbound
        ? htmlToPlainText(htmlWithoutSignature(safeMessage.bodyHtml))
        : null;
    const previewSource =
      outboundBody?.trim() ||
      previewText?.trim() ||
      safeMessage.bodyText?.trim() ||
      htmlToPlainText(safeMessage.bodyHtml);
    const hidden = safeMessage.isHidden === true;
    const canonicalSentAt = existing?.sentAt ?? safeMessage.sentAt;

    const settledThread = existing
      ? await this.prisma.messagingThread.findUnique({
          where: { id: existing.messagingThreadId },
          select: { id: true, unipileThreadId: true },
        })
      : null;
    const misroutedTarget = settledThread && settledThread.unipileThreadId !== unipileThreadId ? settledThread : null;
    const misroutedUpdate = misroutedTarget !== null;

    const thread = misroutedTarget
      ? misroutedTarget
      : await this.upsertChatThreadUnscoped({
          companyId,
          connectedAccountId,
          unipileThreadId,
          provider: safeMessage.provider,
          type: threadType,
          subject: safeMessage.subject,
          lastMessageAt: hidden ? undefined : canonicalSentAt,
          lastMessagePreview: hidden ? undefined : (previewSource ?? null),
          lastMessageIsSender: hidden ? undefined : safeMessage.direction === MessagingMessageDirection.outbound,
          participants: [safeMessage.sender, ...safeMessage.recipients.to, ...safeMessage.recipients.cc],
          markUnread: !hidden && !backfill && !existing && isInbound,
        });

    if (
      !existing &&
      !isInbound &&
      message.origin === MessagingMessageOrigin.external &&
      !isEmailProvider(message.provider)
    ) {
      const reconciled = await this.reconcileOutboundChatEcho({
        messagingThreadId: thread.id,
        connectedAccountId,
        unipileMessageId: message.unipileMessageId,
        bodyText: messageFields.bodyText ?? null,
        sentAt: messageFields.sentAt,
      });

      if (reconciled) return { isEcho: true as const };
    }

    const upserted = await this.upsertMessageUnscoped({
      ...messageFields,
      companyId,
      connectedAccountId,
      messagingThreadId: thread.id,
      keepSettledSender: misroutedUpdate,
      settledAttachmentsMeta: existing?.attachmentsMeta,
    });

    const inboundSender =
      isInbound && safeMessage.sender.pictureUrl
        ? {
            provider: safeMessage.provider,
            identifier: safeMessage.sender.identifier,
            pictureUrl: safeMessage.sender.pictureUrl,
          }
        : undefined;

    return { isEcho: false as const, message: upserted, ...(inboundSender ? { inboundSender } : {}) };
  }

  @BypassTenantGuard
  async findMessageByUnipileIdUnscoped(args: { connectedAccountId: string; unipileMessageId: string }) {
    const { connectedAccountId, unipileMessageId } = args;

    const row = await this.prisma.messagingMessage.findUnique({
      where: {
        connectedAccountId_unipileMessageId: {
          connectedAccountId,
          unipileMessageId,
        },
      },
    });

    return row as unknown as MessagingMessage | null;
  }

  @BypassTenantGuard
  private async upsertMessageUnscoped(
    args: Omit<IngestMessage, "unipileThreadId" | "threadType"> & {
      companyId: string;
      connectedAccountId: string;
      messagingThreadId: string;
      keepSettledSender?: boolean;
      settledAttachmentsMeta?: AttachmentMeta[];
    },
  ) {
    const attachmentsMeta = args.attachmentsMeta.map((incoming, index) => {
      const settled = args.settledAttachmentsMeta?.[index];
      if (!settled) return incoming;

      return {
        ...incoming,
        name: incoming.name ?? settled.name,
        fileName: incoming.fileName ?? settled.fileName,
        size: incoming.size ?? settled.size,
      };
    });

    const updateData = {
      ...(!args.keepSettledSender && args.sender.attendeeId.trim()
        ? {
            sender: args.sender,
            senderIdentifier: args.sender.identifier || null,
          }
        : {}),
      ...(attachmentsMeta.length > 0
        ? {
            attachmentsMeta,
            bodyText: args.bodyText,
            bodyHtml: args.bodyHtml,
            isHidden: args.isHidden,
          }
        : {}),
      ...(args.editedAt
        ? {
            bodyText: args.bodyText,
            bodyHtml: args.bodyHtml,
            editedAt: args.editedAt,
          }
        : {}),
      ...(args.folderIds && args.folderIds.length > 0 ? { folderIds: args.folderIds, isHidden: args.isHidden } : {}),
    };

    const row = await this.prisma.messagingMessage.upsert({
      where: {
        connectedAccountId_unipileMessageId: {
          connectedAccountId: args.connectedAccountId,
          unipileMessageId: args.unipileMessageId,
        },
      },
      create: {
        companyId: args.companyId,
        messagingThreadId: args.messagingThreadId,
        connectedAccountId: args.connectedAccountId,
        unipileMessageId: args.unipileMessageId,
        providerMessageId: args.providerMessageId ?? null,
        provider: args.provider,
        direction: args.direction,
        origin: args.origin,
        sender: args.sender,
        senderIdentifier: args.sender.identifier ?? null,
        recipients: args.recipients,
        reactions: args.reactions,
        subject: args.subject,
        bodyText: args.bodyText,
        bodyHtml: args.bodyHtml,
        attachmentsMeta: args.attachmentsMeta,
        folderIds: args.folderIds ?? [],
        isEvent: args.isEvent,
        isDeleted: args.isDeleted,
        isHidden: args.isHidden,
        sentAt: args.sentAt,
        editedAt: args.editedAt ?? null,
      },
      update: updateData,
    });

    return row as unknown as MessagingMessage;
  }

  @BypassTenantGuard
  async updateMessageReactionsUnscoped(args: RepoArgs<MessagingIngestRepo, "updateMessageReactionsUnscoped">) {
    const message = await this.prisma.messagingMessage.findFirst({
      where: {
        companyId: args.companyId,
        connectedAccountId: args.connectedAccountId,
        unipileMessageId: args.unipileMessageId,
      },
      select: { id: true, messagingThreadId: true },
    });
    if (!message) return null;

    await this.prisma.messagingMessage.update({
      where: { id: message.id },
      data: { reactions: args.reactions },
    });

    return { id: message.id, messagingThreadId: message.messagingThreadId };
  }

  @BypassTenantGuard
  async deleteMessageUnscoped(args: RepoArgs<MessagingIngestRepo, "deleteMessageUnscoped">) {
    const message = await this.prisma.messagingMessage.findFirst({
      where: {
        companyId: args.companyId,
        connectedAccountId: args.connectedAccountId,
        unipileMessageId: args.unipileMessageId,
      },
      select: { id: true, messagingThreadId: true },
    });
    if (!message) return null;

    await this.prisma.messagingMessage.deleteMany({
      where: { id: message.id },
    });

    return { id: message.id, messagingThreadId: message.messagingThreadId };
  }

  @BypassTenantGuard
  async moveEmailMessageUnscoped(args: RepoArgs<MessagingIngestRepo, "moveEmailMessageUnscoped">) {
    const message = await this.prisma.messagingMessage.findFirst({
      where: {
        companyId: args.companyId,
        connectedAccountId: args.connectedAccountId,
        unipileMessageId: args.unipileMessageId,
      },
      select: { id: true },
    });
    if (!message) return null;

    await this.prisma.messagingMessage.update({
      where: { id: message.id },
      data: {
        unipileMessageId: args.newUnipileMessageId,
        folderIds: args.folderIds,
        isHidden: false,
      },
    });

    return { id: message.id };
  }

  @BypassTenantGuard
  async markMessageDeletedUnscoped(args: RepoArgs<MessagingIngestRepo, "markMessageDeletedUnscoped">) {
    const message = await this.prisma.messagingMessage.findFirst({
      where: {
        companyId: args.companyId,
        connectedAccountId: args.connectedAccountId,
        unipileMessageId: args.unipileMessageId,
      },
      select: { id: true, messagingThreadId: true },
    });
    if (!message) return null;

    await this.prisma.messagingMessage.update({
      where: { id: message.id },
      data: { isDeleted: true },
    });

    return { id: message.id, messagingThreadId: message.messagingThreadId };
  }

  @BypassTenantGuard
  async reconcileFolderMembershipUnscoped(args: RepoArgs<MessagingIngestRepo, "reconcileFolderMembershipUnscoped">) {
    const stale = await this.prisma.messagingMessage.findMany({
      where: {
        companyId: args.companyId,
        connectedAccountId: args.connectedAccountId,
        folderIds: { has: args.folderId },
        sentAt: { gte: args.since },
        isDraft: false,
        ...(args.seenUnipileMessageIds.length > 0 ? { unipileMessageId: { notIn: args.seenUnipileMessageIds } } : {}),
      },
      select: { id: true, folderIds: true },
    });

    for (const row of stale) {
      const folderIds = row.folderIds.filter((id) => id !== args.folderId);
      await this.prisma.messagingMessage.update({
        where: { id: row.id },
        data: {
          folderIds,
          ...(folderIds.length === 0 ? { isHidden: true } : {}),
        },
      });
    }

    return stale.length;
  }

  @BypassTenantGuard
  async updateChatThreadMetadataUnscoped(args: RepoArgs<MessagingIngestRepo, "updateChatThreadMetadataUnscoped">) {
    const unipileThreadId = await this.resolveThreadIdByAlt(args.connectedAccountId, args.unipileThreadId);

    const thread = await this.prisma.messagingThread.findFirst({
      where: {
        companyId: args.companyId,
        connectedAccountId: args.connectedAccountId,
        unipileThreadId,
      },
      select: { id: true },
    });
    if (!thread) return null;

    await this.prisma.messagingThread.update({
      where: { id: thread.id },
      data: {
        name: args.name ?? undefined,
        subject: args.subject ?? undefined,
        type: args.type ?? undefined,
      },
    });

    return { id: thread.id };
  }

  @BypassTenantGuard
  async deleteChatThreadUnscoped(args: RepoArgs<MessagingIngestRepo, "deleteChatThreadUnscoped">) {
    const unipileThreadId = await this.resolveThreadIdByAlt(args.connectedAccountId, args.unipileThreadId);

    const thread = await this.prisma.messagingThread.findFirst({
      where: {
        companyId: args.companyId,
        connectedAccountId: args.connectedAccountId,
        unipileThreadId,
      },
      select: { id: true },
    });
    if (!thread) return null;

    await this.prisma.messagingThread.deleteMany({ where: { id: thread.id } });

    return { id: thread.id };
  }
}

async function retryOnUniqueConflict(write: () => Promise<void>): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await write();
      return;
    } catch (error) {
      if (attempt >= 3 || (error as { code?: unknown }).code !== "P2002") throw error;
    }
  }
}

function hasLetter(value: string | null | undefined): value is string {
  return value != null && /\p{L}/u.test(value);
}

function dedupeParticipants<T extends { attendeeId: string }>(participants: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const p of participants) {
    const key = p.attendeeId?.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }

  return out;
}

function cleanString<T extends string | null | undefined>(s: T): T {
  if (s == null) return s;
  return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").toWellFormed() as T;
}

const PLAIN_TEXT_SIGNATURE_DELIMITER = /(?:^|\n)-{2}[ \t]*(?:\r?\n|$)/;
const HTML_SIGNATURE_BLOCK = /<div[^>]*data-customermates-signature[^>]*>[\s\S]*$/i;

function htmlWithoutSignature(html: string | null | undefined): string | null | undefined {
  if (!html) return html;

  return html.replace(HTML_SIGNATURE_BLOCK, "");
}

function plainTextWithoutSignature(text: string): string {
  const match = PLAIN_TEXT_SIGNATURE_DELIMITER.exec(text);
  if (!match) return text;

  const body = text.slice(0, match.index).trim();
  return body || text;
}

function threadPreviewFrom(text: string | null | undefined): string | null {
  if (!text) return null;

  return safeTruncate(plainTextWithoutSignature(text).replace(/\s+/g, " "), 200) || null;
}

function safeTruncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;

  const truncated = s.slice(0, maxLen);
  const lastCode = truncated.charCodeAt(truncated.length - 1);

  if (lastCode >= 0xd800 && lastCode <= 0xdbff) return truncated.slice(0, -1);

  return truncated;
}

function cleanAttendee<T extends Record<string, unknown>>(a: T): T {
  const cleaned: Record<string, unknown> = { ...a };
  delete cleaned.record;
  delete cleaned.contact;
  for (const key of ["identifier", "displayName", "pictureUrl", "profileUrl", "headline", "occupation"]) {
    const value = cleaned[key];
    if (typeof value === "string" || value === null || value === undefined) cleaned[key] = cleanString(value);
  }

  return cleaned as T;
}

function sanitizeMessage(message: IngestMessage): IngestMessage {
  return {
    ...message,
    subject: cleanString(message.subject),
    bodyText: cleanString(message.bodyText),
    bodyHtml: cleanString(message.bodyHtml),
    previewText: cleanString(message.previewText ?? null),
    sender: cleanAttendee(message.sender),
    recipients: {
      to: message.recipients.to.map(cleanAttendee),
      cc: message.recipients.cc.map(cleanAttendee),
      bcc: message.recipients.bcc.map(cleanAttendee),
    },
  };
}
