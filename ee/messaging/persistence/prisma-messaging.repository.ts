import type { MessagingProvider, Prisma } from "@/generated/prisma";

import {
  MessagingMessageDirection,
  MessagingMessageOrigin,
  MessagingThreadState,
  MessagingThreadType,
} from "@/generated/prisma";

import type {
  AttachmentMeta,
  MessagingAttendee,
  MessagingMessage,
  MessagingThread,
  IngestMessage,
} from "../messaging.schema";

import type { GetMessagingThreadRepo } from "../inbox/get-messaging-thread.interactor";
import type { ResyncThreadRepo } from "../inbox/resync-thread.interactor";
import type { GetUnreadThreadCountRepo } from "../inbox/get-unread-thread-count.interactor";
import type { UpdateThreadRepo } from "../thread-state/update-thread.interactor";
import type { MessagingIngestRepo } from "../ingest/messaging-ingest.repo";
import type { RepoArgs } from "@/core/utils/types";
import type { SendChatMessageRepo } from "../outbound/send-chat-message.interactor";
import type { SendEmailRepo } from "../outbound/send-email.interactor";
import type { StartChatThreadRepo } from "../outbound/start-chat.interactor";
import type { SaveDraftRepo } from "../outbound/save-draft.interactor";
import type { DiscardDraftRepo } from "../outbound/discard-draft.interactor";
import type { GetMessageAttachmentMetaRepo } from "../inbox/get-message-attachment.interactor";
import type { GetMessagingThreadsRepo } from "../inbox/get-messaging-threads.interactor";
import type { FindThreadsByIdsRepo } from "../find-threads-by-ids.repo";
import type { ChannelCandidateDto } from "../inbox/search-channel-candidates.interactor";
import type { SearchChannelCandidatesRepo } from "../inbox/search-channel-candidates.interactor";
import type { Filter, GetQueryParams } from "@/core/base/base-get.schema";
import type { ContactReference } from "@/core/base/base-entity.schema";

import { BaseRepository } from "@/core/base/base-repository";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { getContactRepo } from "@/core/di";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";
import type { PreviewKind } from "../attachment-kind";

import { classifyAttachment } from "../attachment-kind";
import { defaultEmailSettings } from "../email-settings";
import { htmlToPlainText } from "../email-body-text";
import { renderEmailMarkdown } from "../outbound/render-signature";
import { contactFullName } from "../thread-display";
import {
  folderMessageWhere,
  threadAccessWhere,
  threadFolderMembershipWhere,
  threadHasActivityWhere,
} from "../messaging-access";
import { channelClass, classWhere, isDraftThreadId, isEmailProvider, isHandleProvider } from "../provider";
import {
  draftRevisionMatches,
  draftThreadProviderId,
  normalizeDraftThreadRecipients,
  type DraftDeleteResult,
} from "../draft-thread";
import { identifierKey } from "@/features/contacts/upsert/validate-identifiers";

type MappedThreadRow = ReturnType<PrismaMessagingRepo["mapThreadRow"]>;
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

function draftPreview(body: string, provider: MessagingProvider): string | null {
  const source = isEmailProvider(provider)
    ? renderEmailMarkdown(body, defaultEmailSettings().appearance).text
    : body.trim();
  return source ? safeTruncate(source.replace(/\s+/g, " "), 200) : null;
}

export class PrismaMessagingRepo
  extends BaseRepository
  implements
    GetMessagingThreadRepo,
    ResyncThreadRepo,
    GetMessagingThreadsRepo,
    GetUnreadThreadCountRepo,
    UpdateThreadRepo,
    MessagingIngestRepo,
    SendChatMessageRepo,
    SendEmailRepo,
    StartChatThreadRepo,
    SaveDraftRepo,
    DiscardDraftRepo,
    SearchChannelCandidatesRepo,
    GetMessageAttachmentMetaRepo,
    FindThreadsByIdsRepo
{
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
    return [{ field: "lastMessageAt", resolvedFields: ["lastMessageAt"] }];
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

  getFilterableFields() {
    return Promise.resolve([
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
    ]);
  }

  private isContactFilterField(field: string) {
    return field === FilterFieldKey.participantContactId.toString() || field === FilterFieldKey.participants.toString();
  }

  private isDraftFilterField(field: string) {
    return field === FilterFieldKey.draft.toString();
  }

  private isRepoHandledFilterField(field: string) {
    return this.isContactFilterField(field) || this.isDraftFilterField(field);
  }

  private draftWhereForFilters(filters: Filter[]): Prisma.MessagingThreadWhereInput[] {
    return filters.map((filter) =>
      filter.operator === FilterOperatorKey.hasNone
        ? { messages: { none: { isDraft: true } } }
        : { messages: { some: { isDraft: true } } },
    );
  }

  private async participantWhereForContactFilters(filters: Filter[]): Promise<Prisma.MessagingThreadWhereInput[]> {
    const clauses: Prisma.MessagingThreadWhereInput[] = [];

    for (const filter of filters) {
      if (filter.operator === FilterOperatorKey.hasUnset || filter.operator === FilterOperatorKey.allSet) {
        const linked = await this.listLinkedIdentifierGroups();
        const linkedClause: Prisma.MessagingThreadParticipantWhereInput =
          linked.length > 0 ? { NOT: { OR: linked } } : {};
        const unlinkedParticipant: Prisma.MessagingThreadParticipantWhereInput = {
          isSelf: false,
          identifier: { not: null },
          ...linkedClause,
        };
        if (filter.operator === FilterOperatorKey.hasUnset)
          clauses.push({ participants: { some: unlinkedParticipant } });
        else if (linked.length === 0) clauses.push({ id: { in: [] } });
        else {
          clauses.push({
            participants: {
              some: { isSelf: false, OR: linked },
              none: unlinkedParticipant,
            },
          });
        }

        continue;
      }

      const contactIds = "value" in filter ? (Array.isArray(filter.value) ? filter.value : [String(filter.value)]) : [];
      const groups = await this.identifierWhereForContacts(contactIds);

      if (filter.operator === FilterOperatorKey.notIn) {
        if (groups.length > 0) clauses.push({ participants: { none: { OR: groups } } });
        continue;
      }

      clauses.push(groups.length > 0 ? { participants: { some: { OR: groups } } } : { id: { in: [] } });
    }

    return clauses;
  }

  override async buildQueryArgs(params: GetQueryParams, baseWhere: Prisma.MessagingThreadWhereInput = {}) {
    const filters = params.filters ?? [];
    const handledFilters = filters.filter((f) => this.isRepoHandledFilterField(f.field));
    if (handledFilters.length === 0) return super.buildQueryArgs(params, baseWhere);

    const clauses = [
      ...(await this.participantWhereForContactFilters(
        handledFilters.filter((f) => this.isContactFilterField(f.field)),
      )),
      ...this.draftWhereForFilters(handledFilters.filter((f) => this.isDraftFilterField(f.field))),
    ];
    const existingAnd = Array.isArray(baseWhere.AND) ? baseWhere.AND : baseWhere.AND ? [baseWhere.AND] : [];
    const mergedBaseWhere: Prisma.MessagingThreadWhereInput = {
      ...baseWhere,
      AND: [...existingAnd, ...clauses],
    };
    const strippedParams = {
      ...params,
      filters: filters.filter((f) => !this.isRepoHandledFilterField(f.field)),
    };

    return super.buildQueryArgs(strippedParams, mergedBaseWhere);
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
        participant.contact = contactByKey.get(identifierKey(thread.provider, participant.identifier)) ?? null;

      if (thread.lastMessageSenderIdentifier) {
        const senderName = contactFullName(
          contactByKey.get(identifierKey(thread.provider, thread.lastMessageSenderIdentifier)),
        );
        if (senderName) thread.lastMessageSenderName = senderName;
      }
    }

    await this.resolveParticipantNamesAcrossThreads(threads);

    return threads;
  }

  private async resolveBestNamesByProviderUserId(providerUserIds: Set<string>): Promise<Map<string, string>> {
    if (providerUserIds.size === 0) return new Map();

    const rows = await this.prisma.messagingThreadParticipant.findMany({
      where: {
        companyId: this.companyId,
        providerUserId: { in: [...providerUserIds] },
      },
      select: { providerUserId: true, displayName: true },
    });

    const bestName = new Map<string, string>();
    for (const row of rows) {
      if (hasLetter(row.displayName) && !bestName.has(row.providerUserId))
        bestName.set(row.providerUserId, row.displayName);
    }

    return bestName;
  }

  private async resolveParticipantNamesAcrossThreads<T extends MappedThreadRow>(threads: T[]): Promise<void> {
    const unnamed = new Set<string>();
    for (const thread of threads)
      for (const p of thread.participants) if (p.attendeeId && !hasLetter(p.displayName)) unnamed.add(p.attendeeId);

    const bestName = await this.resolveBestNamesByProviderUserId(unnamed);

    for (const thread of threads) {
      const single = thread.type === MessagingThreadType.single;
      for (const p of thread.participants) {
        if (hasLetter(p.displayName)) continue;
        const better = bestName.get(p.attendeeId) || (single && !p.isSelf && hasLetter(thread.name) ? thread.name : "");
        if (better) p.displayName = better;
      }
    }
  }

  private async loadAccessibleFolderStates() {
    const rows = await this.prisma.connectedAccount.findMany({
      where: {
        companyId: this.companyId,
        OR: [{ userId: this.userId }, { shared: true }],
        foldersSyncedAt: { not: null },
      },
      select: { id: true, selectedFolderIds: true },
    });

    return rows.map((row) => ({
      id: row.id,
      visibleSet: row.selectedFolderIds,
    }));
  }

  async getItems(params: GetQueryParams) {
    const folderMembership = threadFolderMembershipWhere(await this.loadAccessibleFolderStates());
    const threads = await this.list({
      model: "messagingThread",
      baseWhere: {
        ...threadAccessWhere(this.companyId, this.userId),
        AND: [threadHasActivityWhere(), ...(folderMembership ? [folderMembership] : [])],
      },
      select: this.threadSelect,
      params: {
        ...params,
        sortDescriptor: params.sortDescriptor ?? {
          field: "lastMessageAt",
          direction: "desc",
        },
      },
      map: (
        row: Prisma.MessagingThreadGetPayload<{
          select: PrismaMessagingRepo["threadSelect"];
        }>,
      ) => this.mapThreadRow(row),
    });

    return this.hydrateThreadContacts(threads);
  }

  async getCount(params: GetQueryParams) {
    const folderMembership = threadFolderMembershipWhere(await this.loadAccessibleFolderStates());
    const { where } = await this.buildQueryArgs(params, {
      ...threadAccessWhere(this.companyId, this.userId),
      AND: [threadHasActivityWhere(), ...(folderMembership ? [folderMembership] : [])],
    });

    return this.prisma.messagingThread.count({ where });
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
        ? safeTruncate(args.lastMessagePreview.replace(/\s+/g, " "), 200)
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

    const [hydrated] = await this.hydrateThreadContacts([this.mapThreadRow(row)]);
    return hydrated;
  }

  async findThreadById(id: string) {
    const row = await this.prisma.messagingThread.findFirst({
      where: { id, ...threadAccessWhere(this.companyId, this.userId) },
      select: this.threadSelect,
    });
    if (!row) return null;

    const [hydrated] = await this.hydrateThreadContacts([this.mapThreadRow(row)]);
    return hydrated;
  }

  async findThreadForResyncOrThrow(threadId: string) {
    const row = await this.prisma.messagingThread.findFirstOrThrow({
      where: {
        id: threadId,
        ...threadAccessWhere(this.companyId, this.userId),
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

    const { connectedAccount, ...rest } = row;

    return {
      ...rest,
      unipileAccountId: connectedAccount.unipileAccountId,
      emailAddress: connectedAccount.emailAddress,
      sentFolderIds: connectedAccount.sentFolderIds,
    };
  }

  @BypassTenantGuard
  async recordUnusableItemUnscoped(args: RepoArgs<ResyncThreadRepo, "recordUnusableItemUnscoped">) {
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

  private mapThreadRow(
    row: Prisma.MessagingThreadGetPayload<{
      select: PrismaMessagingRepo["threadSelect"];
    }>,
  ) {
    const { messages, participants, connectedAccount, lastMessagePreview, lastMessageIsSender, ...rest } = row;
    const last = messages[0];
    const previewSource =
      last?.isDraft && isEmailProvider(row.provider)
        ? draftPreview(last.bodyText ?? "", row.provider)
        : last?.bodyText?.trim() || htmlToPlainText(last?.bodyHtml);
    const derivedPreview = previewSource ? safeTruncate(previewSource.replace(/\s+/g, " "), 200) : null;
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
      accountShared: connectedAccount.shared,
      isOwner: connectedAccount.userId === this.userId,
      participants: participants.map(({ providerUserId, identifier, ...attendee }) => ({
        ...attendee,
        identifier: identifier ?? "",
        attendeeId: providerUserId,
        contact: null as ContactReference | null,
      })),
      preview,
      previewKind,
      lastMessageFromSelf: last
        ? last.direction === MessagingMessageDirection.outbound
        : (lastMessageIsSender ?? false),
      lastMessageSenderName: (last?.sender as unknown as MessagingAttendee | null)?.displayName?.trim() || null,
      lastMessageSenderIdentifier: (last?.sender as unknown as MessagingAttendee | null)?.identifier ?? null,
    };
  }

  async countUnreadThreadsForCurrentUser() {
    return this.prisma.messagingThread.count({
      where: {
        state: "unread",
        ...threadAccessWhere(this.companyId, this.userId),
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
      contact: null,
    };
  }

  async findOrCreateDraftThread(args: {
    connectedAccountId: string;
    provider: MessagingProvider;
    recipients: string[];
  }) {
    const normalizedRecipients = normalizeDraftThreadRecipients(args.provider, args.recipients);
    if (!normalizedRecipients) throw new Error("Cannot create a draft thread for an invalid recipient");
    const recipients = normalizedRecipients;
    const unipileThreadId = draftThreadProviderId(args.provider, recipients);
    let row: MessagingThread;
    try {
      row = (await this.prisma.messagingThread.upsert({
        where: {
          companyId: this.companyId,
          connectedAccountId_unipileThreadId: {
            connectedAccountId: args.connectedAccountId,
            unipileThreadId,
          },
        },
        update: { companyId: this.companyId },
        create: {
          companyId: this.companyId,
          connectedAccountId: args.connectedAccountId,
          provider: args.provider,
          unipileThreadId,
          type: recipients.length > 1 ? MessagingThreadType.group : MessagingThreadType.single,
          state: MessagingThreadState.open,
          participants: {
            create: recipients.map((identifier) => ({
              companyId: this.companyId,
              provider: args.provider,
              providerUserId: identifier,
              identifier,
            })),
          },
        },
      })) as unknown as MessagingThread;
    } catch (error) {
      if ((error as { code?: unknown }).code !== "P2002") throw error;
      const raced = await this.prisma.messagingThread.findFirst({
        where: {
          companyId: this.companyId,
          connectedAccountId: args.connectedAccountId,
          unipileThreadId,
        },
      });
      if (!raced) throw error;
      row = raced as unknown as MessagingThread;
    }

    return row;
  }

  async upsertThreadDraftOrThrow(args: {
    threadId: string;
    connectedAccountId: string;
    provider: MessagingProvider;
    sender: MessagingAttendee;
    subject: string | null;
    bodyText: string;
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
        },
        select: { id: true, unipileThreadId: true },
      });

      const now = new Date();
      const unipileMessageId = draftMessageProviderId(args.threadId);
      const messageData = {
        sender: args.sender,
        senderIdentifier: args.sender.identifier || null,
        recipients: args.recipients,
        subject: args.subject,
        bodyText: args.bodyText,
        bodyHtml: null,
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
      const existing = existingDrafts.find((draft) => draft.unipileMessageId === unipileMessageId) ?? existingDrafts[0];
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
          lastMessagePreview: draftPreview(args.bodyText, args.provider),
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

  async deleteDraft(args: { messageId: string; expectedUpdatedAt: Date }) {
    return this.withCompanyTransaction(this.companyId, () => this.deleteDraftInCurrentTransaction(args));
  }

  async discardDraftAfterSend(args: { messageId: string; expectedUpdatedAt: Date }) {
    await this.withCompanyTransaction(this.companyId, () => this.deleteDraftInCurrentTransaction(args));
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
        thread: threadAccessWhere(this.companyId, this.userId),
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
    const preview = latest?.bodyText?.trim() || htmlToPlainText(latest?.bodyHtml) || null;

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
              connectedAccountId: args.connectedAccountId,
              providerMessageId: args.message.providerMessageId,
              isDraft: false,
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          })
        : null;

      if (!duplicate) throw new Error("Outbound message deduplicated without a persisted row");

      return duplicate as unknown as MessagingMessage;
    }

    if (!result.isEcho) return result.message;

    const existing = await this.findMessageByUnipileIdUnscoped({
      connectedAccountId: args.connectedAccountId,
      unipileMessageId: args.message.unipileMessageId,
    });

    if (!existing) throw new Error("Outbound message echoed without a persisted row");

    return existing;
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
        provider: true,
        name: true,
        type: true,
        connectedAccount: {
          select: { selectedFolderIds: true, foldersSyncedAt: true },
        },
      },
    });

    if (!accessibleThread) return { messages: [] as MessagingMessage[], total: 0 };

    const account = accessibleThread.connectedAccount;
    const folderWhere = account.foldersSyncedAt !== null ? folderMessageWhere(account.selectedFolderIds) : {};
    const where = {
      messagingThreadId: threadId,
      companyId: this.companyId,
      isHidden: false,
      ...folderWhere,
    };
    const pageSize = opts?.pageSize;

    if (pageSize === undefined) {
      const rows = await this.prisma.messagingMessage.findMany({
        where,
        orderBy: { sentAt: "asc" },
      });
      const messages = this.redactBcc(rows) as unknown as MessagingMessage[];
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

    const messages = (this.redactBcc(rows) as unknown as MessagingMessage[]).reverse();
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
    const senderIds = messages.map((message) => message.sender.identifier.trim());
    const pairs = senderIds.filter((value) => value.length > 0).map((value) => ({ provider, value }));
    const contactByKey = pairs.length > 0 ? await this.resolveContactsByIdentifiers(pairs) : null;

    const unnamed = new Set<string>();
    for (const message of messages) {
      if (!message.sender.isSelf && message.sender.attendeeId && !hasLetter(message.sender.displayName))
        unnamed.add(message.sender.attendeeId);
    }
    const bestName = await this.resolveBestNamesByProviderUserId(unnamed);
    const single = thread.type === MessagingThreadType.single;

    messages.forEach((message, index) => {
      const value = senderIds[index];
      message.sender.contact =
        value.length > 0 && contactByKey ? (contactByKey.get(identifierKey(provider, value)) ?? null) : null;

      if (message.sender.isSelf || hasLetter(message.sender.displayName)) return;
      const better = bestName.get(message.sender.attendeeId) || (single && hasLetter(thread.name) ? thread.name : "");
      if (better) message.sender.displayName = better;
    });
  }

  private redactBcc<T extends { recipients: unknown; direction: MessagingMessageDirection }>(rows: T[]): T[] {
    return rows.map((row) => {
      if (row.direction === MessagingMessageDirection.outbound) return row;

      const recipients = row.recipients;
      if (recipients && typeof recipients === "object" && "bcc" in recipients)
        return { ...row, recipients: { ...recipients, bcc: [] } };

      return row;
    });
  }

  @BypassTenantGuard
  async findParticipantPictureUrlUnscoped(args: { companyId: string; contactId: string }) {
    const identifiers = await this.prisma.contactIdentifier.findMany({
      where: { companyId: args.companyId, contactId: args.contactId },
      select: { provider: true, value: true, messagingId: true },
    });
    if (identifiers.length === 0) return null;

    const byClass = new Map<string, { provider: MessagingProvider; values: Set<string> }>();
    for (const row of identifiers) {
      const entry = byClass.get(channelClass(row.provider)) ?? {
        provider: row.provider,
        values: new Set<string>(),
      };
      entry.values.add(row.value);
      if (row.messagingId) entry.values.add(row.messagingId);
      byClass.set(channelClass(row.provider), entry);
    }
    const orGroups = [...byClass.values()].map(({ provider, values }) => ({
      ...classWhere(provider),
      identifier: { in: [...values] },
    }));

    const participant = await this.prisma.messagingThreadParticipant.findFirst({
      where: {
        companyId: args.companyId,
        OR: orGroups,
        pictureUrl: { not: null },
      },
      orderBy: { createdAt: "asc" },
      select: { pictureUrl: true },
    });

    return participant?.pictureUrl ?? null;
  }

  private async listLinkedIdentifierGroups(): Promise<Prisma.MessagingThreadParticipantWhereInput[]> {
    const rows = await this.prisma.contactIdentifier.findMany({
      where: { companyId: this.companyId },
      select: { provider: true, value: true, messagingId: true },
    });

    const byClass = new Map<string, { provider: MessagingProvider; values: Set<string> }>();
    for (const row of rows) {
      const entry = byClass.get(channelClass(row.provider)) ?? {
        provider: row.provider,
        values: new Set<string>(),
      };
      entry.values.add(row.value);
      if (row.messagingId) entry.values.add(row.messagingId);
      byClass.set(channelClass(row.provider), entry);
    }

    return [...byClass.values()].map(({ provider, values }) => ({
      ...classWhere(provider),
      identifier: { in: [...values] },
    }));
  }

  private async resolveContactsByIdentifiers(
    pairs: { provider: MessagingProvider; value: string }[],
  ): Promise<Map<string, ContactReference>> {
    const result = new Map<string, ContactReference>();
    if (pairs.length === 0) return result;

    const valuesByClass = new Map<string, { provider: MessagingProvider; values: Set<string> }>();
    for (const pair of pairs) {
      const entry = valuesByClass.get(channelClass(pair.provider)) ?? {
        provider: pair.provider,
        values: new Set<string>(),
      };
      entry.values.add(pair.value);
      valuesByClass.set(channelClass(pair.provider), entry);
    }

    const rows = await this.prisma.contactIdentifier.findMany({
      where: {
        companyId: this.companyId,
        OR: [...valuesByClass.values()].map(({ provider, values }) => ({
          ...classWhere(provider),
          OR: [{ value: { in: [...values] } }, { messagingId: { in: [...values] } }],
        })),
      },
      select: {
        provider: true,
        value: true,
        messagingId: true,
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
      },
    });

    for (const row of rows) {
      result.set(identifierKey(row.provider, row.value), row.contact);
      if (row.messagingId) result.set(identifierKey(row.provider, row.messagingId), row.contact);
    }
    return result;
  }

  private async identifierWhereForContacts(
    contactIds: string[],
  ): Promise<Prisma.MessagingThreadParticipantWhereInput[]> {
    const groups = await getContactRepo().classGroupedIdentifierWhereCompanyWide(contactIds);
    return groups.map((group) => ({
      ...group.providerWhere,
      identifier: group.identifier,
    }));
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
        const folderIds = [...new Set([...duplicate.folderIds, ...(safeMessage.folderIds ?? [])])];

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

    const previewSource =
      previewText?.trim() || safeMessage.bodyText?.trim() || safeMessage.bodyHtml?.replace(/<[^>]*>/g, "").trim();
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

    const contactId = isInbound ? await this.resolveSenderContactId(companyId, message) : null;
    if (contactId) {
      await getContactRepo().recomputeContactAvatarUnscoped({
        contactId,
        companyId,
      });
    }

    return { isEcho: false as const, message: upserted };
  }

  private async resolveSenderContactId(companyId: string, message: IngestMessage): Promise<string | null> {
    const senderIdentifier = message.sender.identifier?.trim();
    if (!senderIdentifier) return null;

    const matched = senderIdentifier.includes("@")
      ? await getContactRepo().findContactByEmailUnscoped({
          companyId,
          email: senderIdentifier.toLowerCase(),
        })
      : await getContactRepo().findContactBySocialIdentifierUnscoped({
          companyId,
          provider: message.provider,
          identifier: senderIdentifier,
        });

    return matched?.id ?? null;
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

function safeTruncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;

  const truncated = s.slice(0, maxLen);
  const lastCode = truncated.charCodeAt(truncated.length - 1);

  if (lastCode >= 0xd800 && lastCode <= 0xdbff) return truncated.slice(0, -1);

  return truncated;
}

function cleanAttendee<T extends Record<string, unknown>>(a: T): T {
  const cleaned: Record<string, unknown> = { ...a };
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
