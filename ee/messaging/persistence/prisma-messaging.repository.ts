import type { MessagingProvider } from "@/generated/prisma";
import { type Prisma } from "@/generated/prisma";

import { MessagingMessageDirection, MessagingMessageOrigin } from "@/generated/prisma";

import type { MessageReactionEntry, MessagingAttendee, MessagingMessage, IngestMessage } from "../messaging.schema";

import type { GetMessagingThreadRepo } from "../inbox/get-messaging-thread.interactor";
import type { GetUnreadThreadCountRepo } from "../inbox/get-unread-thread-count.interactor";
import type { UpdateThreadRepo } from "../thread-state/update-thread.interactor";
import type { ProcessMessagingWebhookRepo } from "../webhooks/process-messaging-webhook.interactor";
import type { ProcessEmailWebhookRepo } from "../webhooks/process-email-webhook.interactor";
import type { ProcessUsersWebhookRepo } from "../webhooks/process-users-webhook.interactor";
import type { MessagingIngestRepo } from "../ingest/messaging-ingest.repo";
import type { RepoArgs } from "@/core/utils/types";
import type { SendChatMessageRepo } from "../outbound/send-chat-message.interactor";
import type { SendEmailRepo } from "../outbound/send-email.interactor";
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
import { contactFullName } from "../thread-display";
import { threadAccessWhere } from "../messaging-access";
import { channelClass, classWhere } from "../provider";
import { identifierKey } from "@/features/contacts/upsert/validate-identifiers";

type MappedThreadRow = ReturnType<PrismaMessagingRepo["mapThreadRow"]>;

export class PrismaMessagingRepo
  extends BaseRepository
  implements
    GetMessagingThreadRepo,
    GetMessagingThreadsRepo,
    GetUnreadThreadCountRepo,
    UpdateThreadRepo,
    ProcessMessagingWebhookRepo,
    ProcessEmailWebhookRepo,
    ProcessUsersWebhookRepo,
    MessagingIngestRepo,
    SendChatMessageRepo,
    SendEmailRepo,
    SearchChannelCandidatesRepo,
    GetMessageAttachmentMetaRepo,
    FindThreadsByIdsRepo
{
  async searchChannelCandidates(query: RepoArgs<SearchChannelCandidatesRepo, "searchChannelCandidates">) {
    const rows = await this.prisma.messagingThreadParticipant.findMany({
      where: {
        companyId: this.companyId,
        isSelf: false,
        displayName: { contains: query, mode: "insensitive" },
        thread: threadAccessWhere(this.companyId, this.userId),
      },
      select: {
        provider: true,
        identifier: true,
        displayName: true,
        profileUrl: true,
      },
      take: 50,
    });

    const seen = new Set<string>();
    const candidates: ChannelCandidateDto[] = [];
    for (const row of rows) {
      if (!row.identifier) continue;
      const key = `${row.provider}:${row.identifier}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({
        provider: row.provider,
        value: row.identifier,
        displayName: row.displayName,
        profileUrl: row.profileUrl,
      });
      if (candidates.length >= 10) break;
    }

    return candidates;
  }

  private get participantSelect() {
    return {
      unipileAttendeeId: true,
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
        select: {
          direction: true,
          bodyText: true,
          bodyHtml: true,
          sender: true,
        },
        orderBy: { sentAt: "desc" as const },
        take: 1,
      },
    } as const;
  }

  getSortableFields() {
    return [{ field: "lastMessageAt", resolvedFields: ["lastMessageAt"] }];
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
    ]);
  }

  private isContactFilterField(field: string) {
    return field === FilterFieldKey.participantContactId.toString() || field === FilterFieldKey.participants.toString();
  }

  private async participantWhereForContactFilters(filters: Filter[]): Promise<Prisma.MessagingThreadWhereInput[]> {
    const clauses: Prisma.MessagingThreadWhereInput[] = [];

    for (const filter of filters) {
      if (filter.operator === FilterOperatorKey.hasUnset) {
        const linked = await this.listLinkedIdentifierGroups();
        const linkedClause: Prisma.MessagingThreadParticipantWhereInput =
          linked.length > 0 ? { NOT: { OR: linked } } : {};
        clauses.push({
          participants: {
            some: { isSelf: false, identifier: { not: null }, ...linkedClause },
          },
        });
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
    const contactFilters = filters.filter((f) => this.isContactFilterField(f.field));
    if (contactFilters.length === 0) return super.buildQueryArgs(params, baseWhere);

    const participantClauses = await this.participantWhereForContactFilters(contactFilters);
    const existingAnd = Array.isArray(baseWhere.AND) ? baseWhere.AND : baseWhere.AND ? [baseWhere.AND] : [];
    const mergedBaseWhere: Prisma.MessagingThreadWhereInput = {
      ...baseWhere,
      AND: [...existingAnd, ...participantClauses],
    };
    const strippedParams = {
      ...params,
      filters: filters.filter((f) => !this.isContactFilterField(f.field)),
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

    return threads;
  }

  async getItems(params: GetQueryParams) {
    const threads = await this.list({
      model: "messagingThread",
      baseWhere: {
        ...threadAccessWhere(this.companyId, this.userId),
        messages: { some: {} },
      },
      select: this.threadSelect,
      params: {
        ...params,
        sortDescriptor: { field: "lastMessageAt", direction: "desc" },
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
    const { where } = await this.buildQueryArgs(params, {
      ...threadAccessWhere(this.companyId, this.userId),
      messages: { some: {} },
    });

    return this.prisma.messagingThread.count({ where });
  }

  private async upsertThread(
    args: RepoArgs<MessagingIngestRepo, "upsertChatThread"> & {
      markUnread?: boolean;
      lastMessageAt?: Date | null;
    },
  ) {
    const row = await this.prisma.messagingThread.upsert({
      where: {
        connectedAccountId_unipileThreadId: {
          connectedAccountId: args.connectedAccountId,
          unipileThreadId: args.unipileThreadId,
        },
      },
      create: {
        companyId: args.companyId,
        connectedAccountId: args.connectedAccountId,
        unipileThreadId: args.unipileThreadId,
        provider: args.provider,
        subject: args.subject,
        lastMessageAt: args.lastMessageAt ?? null,
        type: args.type,
        name: args.name,
        state: args.markUnread === false ? "open" : "unread",
      },
      update: {
        subject: args.subject ?? undefined,
        type: args.type ?? undefined,
        name: args.name ?? undefined,
        state: args.markUnread ? "unread" : undefined,
      },
      select: { id: true },
    });

    await this.upsertThreadParticipants(row.id, args.companyId, args.provider, args.participants);

    if (args.lastMessageAt) {
      await this.prisma.messagingThread.updateMany({
        where: {
          id: row.id,
          OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: args.lastMessageAt } }],
        },
        data: { lastMessageAt: args.lastMessageAt },
      });
    }

    return row;
  }

  async upsertChatThread(args: RepoArgs<MessagingIngestRepo, "upsertChatThread">) {
    await this.upsertThread({ ...args, markUnread: false });
  }

  private async upsertThreadParticipants(
    messagingThreadId: string,
    companyId: string,
    provider: MessagingProvider,
    incoming: MessagingAttendee[],
  ) {
    const participants = dedupeParticipants(incoming.filter((p) => !p.isSelf && p.attendeeId.trim()));
    if (participants.length === 0) return;

    await retryOnUniqueConflict(() =>
      this.writeThreadParticipants(messagingThreadId, companyId, provider, participants),
    );
  }

  private async writeThreadParticipants(
    messagingThreadId: string,
    companyId: string,
    provider: MessagingProvider,
    participants: MessagingAttendee[],
  ) {
    const values = participants.map((p) => p.identifier).filter(Boolean);

    const existingRows = await this.prisma.messagingThreadParticipant.findMany({
      where: { companyId, messagingThreadId, identifier: { in: values } },
      select: { identifier: true, unipileAttendeeId: true },
    });
    const attendeeByIdentifier = new Map(existingRows.map((row) => [row.identifier, row.unipileAttendeeId]));
    const handledIdentifiers = new Set<string>();

    for (const p of participants) {
      if (p.identifier) {
        if (handledIdentifiers.has(p.identifier)) continue;
        handledIdentifiers.add(p.identifier);

        const existingAttendeeId = attendeeByIdentifier.get(p.identifier);
        if (existingAttendeeId && existingAttendeeId !== p.attendeeId) {
          await this.prisma.messagingThreadParticipant.update({
            where: {
              messagingThreadId_unipileAttendeeId: {
                messagingThreadId,
                unipileAttendeeId: existingAttendeeId,
              },
            },
            data: {
              displayName: p.displayName ?? undefined,
              pictureUrl: p.pictureUrl ?? undefined,
              profileUrl: p.profileUrl ?? undefined,
              headline: p.headline ?? undefined,
              occupation: p.occupation ?? undefined,
            },
          });
          continue;
        }
      }

      await this.prisma.messagingThreadParticipant.upsert({
        where: {
          messagingThreadId_unipileAttendeeId: {
            messagingThreadId,
            unipileAttendeeId: p.attendeeId,
          },
        },
        create: {
          companyId,
          messagingThreadId,
          provider,
          unipileAttendeeId: p.attendeeId,
          identifier: p.identifier || null,
          displayName: p.displayName ?? null,
          pictureUrl: p.pictureUrl ?? null,
          profileUrl: p.profileUrl ?? null,
          headline: p.headline ?? null,
          occupation: p.occupation ?? null,
        },
        update: {
          identifier: p.identifier || undefined,
          displayName: p.displayName ?? undefined,
          pictureUrl: p.pictureUrl ?? undefined,
          profileUrl: p.profileUrl ?? undefined,
          headline: p.headline ?? undefined,
          occupation: p.occupation ?? undefined,
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

  async findThreadIds(ids: Set<string>) {
    if (ids.size === 0) return new Set<string>();

    const threads = await this.prisma.messagingThread.findMany({
      where: { id: { in: Array.from(ids) }, ...threadAccessWhere(this.companyId, this.userId) },
      select: { id: true },
    });

    return new Set(threads.map((thread) => thread.id));
  }

  private mapThreadRow(
    row: Prisma.MessagingThreadGetPayload<{
      select: PrismaMessagingRepo["threadSelect"];
    }>,
  ) {
    const { messages, participants, connectedAccount, ...rest } = row;
    const last = messages[0];
    const previewSource = last?.bodyText?.trim() || last?.bodyHtml?.replace(/<[^>]*>/g, "").trim();

    return {
      ...rest,
      accountShared: connectedAccount.shared,
      isOwner: connectedAccount.userId === this.userId,
      participants: participants.map(({ unipileAttendeeId, identifier, ...attendee }) => ({
        ...attendee,
        identifier: identifier ?? "",
        attendeeId: unipileAttendeeId,
        contact: null as ContactReference | null,
      })),
      preview: previewSource ? safeTruncate(previewSource.replace(/\s+/g, " "), 200) : null,
      lastMessageFromSelf: last?.direction === MessagingMessageDirection.outbound,
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

  async findLatestUnipileMessageIdForThread(threadId: string) {
    const row = await this.prisma.messagingMessage.findFirst({
      where: {
        messagingThreadId: threadId,
        companyId: this.companyId,
        thread: threadAccessWhere(this.companyId, this.userId),
      },
      orderBy: { sentAt: "desc" },
      select: { unipileMessageId: true },
    });

    return row?.unipileMessageId ?? null;
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
      select: { unipileMessageId: true, provider: true, attachmentsMeta: true },
    });

    const list = Array.isArray(row.attachmentsMeta)
      ? (row.attachmentsMeta as Array<{
          id: string;
          mime?: string | null;
          fileName?: string | null;
        }>)
      : [];
    const att = list.find((a) => a.id === args.attachmentId);

    if (!att) throw new Error(`Attachment ${args.attachmentId} not found on message ${args.messageId}`);

    return {
      unipileMessageId: row.unipileMessageId,
      provider: row.provider,
      mime: att.mime ?? null,
      fileName: att.fileName ?? null,
    };
  }

  async listMessagesForThread(threadId: string) {
    const accessibleThread = await this.prisma.messagingThread.findFirst({
      where: {
        id: threadId,
        ...threadAccessWhere(this.companyId, this.userId),
      },
      select: { id: true, provider: true },
    });

    if (!accessibleThread) return [];

    const rows = await this.prisma.messagingMessage.findMany({
      where: { messagingThreadId: threadId, companyId: this.companyId },
      orderBy: { sentAt: "asc" },
    });

    const messages = this.redactBcc(rows) as unknown as MessagingMessage[];
    await this.hydrateMessageSenderContacts(messages, accessibleThread.provider);

    return messages;
  }

  private async hydrateMessageSenderContacts(messages: MessagingMessage[], provider: MessagingProvider) {
    const senderIds = messages.map((message) => message.sender.identifier.trim());
    const pairs = senderIds.filter((value) => value.length > 0).map((value) => ({ provider, value }));
    if (pairs.length === 0) return;

    const contactByKey = await this.resolveContactsByIdentifiers(pairs);
    messages.forEach((message, index) => {
      const value = senderIds[index];
      message.sender.contact = value.length > 0 ? (contactByKey.get(identifierKey(provider, value)) ?? null) : null;
    });
  }

  private redactBcc<T extends { recipients: unknown }>(rows: T[]): T[] {
    return rows.map((row) => {
      const recipients = row.recipients;
      if (recipients && typeof recipients === "object" && "bcc" in recipients)
        return { ...row, recipients: { ...recipients, bcc: [] } };

      return row;
    });
  }

  async findParticipantPictureUrlUnscoped(args: { companyId: string; contactId: string }) {
    const identifiers = await this.prisma.contactIdentifier.findMany({
      where: { companyId: args.companyId, contactId: args.contactId },
      select: { provider: true, value: true, messagingId: true },
    });
    if (identifiers.length === 0) return null;

    const byClass = new Map<string, { provider: MessagingProvider; values: Set<string> }>();
    for (const row of identifiers) {
      const entry = byClass.get(channelClass(row.provider)) ?? { provider: row.provider, values: new Set<string>() };
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
      const entry = byClass.get(channelClass(row.provider)) ?? { provider: row.provider, values: new Set<string>() };
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
    const groups = await getContactRepo().classGroupedIdentifierWhereUnscoped(contactIds);
    return groups.map((group) => ({ ...group.providerWhere, identifier: group.identifier }));
  }

  async ingestMessage({
    companyId,
    connectedAccountId,
    message,
    backfill,
  }: RepoArgs<MessagingIngestRepo, "ingestMessage">) {
    const existing = await this.findMessageByUnipileIdUnscoped({
      connectedAccountId,
      unipileMessageId: message.unipileMessageId,
    });

    const isInbound = message.direction === MessagingMessageDirection.inbound;

    if (existing && !isInbound && message.origin === MessagingMessageOrigin.unipile) return { isEcho: true as const };

    const safeMessage = sanitizeMessage(message);
    const { unipileThreadId, threadType, ...messageFields } = safeMessage;

    const thread = await this.upsertThread({
      companyId,
      connectedAccountId,
      unipileThreadId,
      provider: safeMessage.provider,
      type: threadType,
      subject: safeMessage.subject,
      lastMessageAt: safeMessage.sentAt,
      participants: [safeMessage.sender, ...safeMessage.recipients.to, ...safeMessage.recipients.cc],
      markUnread: !backfill && !existing && isInbound,
    });

    const upserted = await this.upsertMessageUnscoped({
      ...messageFields,
      companyId,
      connectedAccountId,
      messagingThreadId: thread.id,
    });

    const contactId = isInbound ? await this.resolveSenderContactId(companyId, message) : null;
    if (contactId) {
      await getContactRepo().recomputeContactAvatarUnscoped({
        contactId,
        companyId,
      });
    }

    return {
      isEcho: false as const,
      message: upserted,
      contactId,
      isNew: !existing,
    };
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
  async countMessagesUnscoped(connectedAccountId: string) {
    return this.prisma.messagingMessage.count({
      where: { connectedAccountId },
    });
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
  async findMessageByUnipileIdOrThrowUnscoped(
    args: RepoArgs<ProcessMessagingWebhookRepo, "findMessageByUnipileIdOrThrowUnscoped">,
  ) {
    const { connectedAccountId, unipileMessageId } = args;

    const row = await this.prisma.messagingMessage.findUniqueOrThrow({
      where: {
        connectedAccountId_unipileMessageId: {
          connectedAccountId,
          unipileMessageId,
        },
      },
    });

    return row as unknown as MessagingMessage;
  }

  @BypassTenantGuard
  private async upsertMessageUnscoped(
    args: Omit<IngestMessage, "unipileThreadId" | "threadType"> & {
      companyId: string;
      connectedAccountId: string;
      messagingThreadId: string;
    },
  ) {
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
        isEvent: args.isEvent,
        deletedAt: args.deletedAt,
        sentAt: args.sentAt,
      },
      update: {
        deletedAt: args.deletedAt ?? undefined,
        ...(args.sender.attendeeId.trim()
          ? {
              sender: args.sender,
              senderIdentifier: args.sender.identifier || null,
            }
          : {}),
      },
    });

    return row as unknown as MessagingMessage;
  }

  @BypassTenantGuard
  async applyMessageReactionUnscoped(args: RepoArgs<ProcessMessagingWebhookRepo, "applyMessageReactionUnscoped">) {
    await this.withCompanyTransaction(args.companyId, async () => {
      const row = await this.prisma.messagingMessage.findUnique({
        where: { id: args.messagingMessageId },
        select: { reactions: true },
      });
      if (!row) {
        throw new Error(
          `applyMessageReactionUnscoped: message ${args.messagingMessageId} not found (value=${args.value}, attendeeId=${args.attendeeId})`,
        );
      }

      const entries = ((row.reactions as unknown as MessageReactionEntry[] | null) ?? []).filter(
        (entry) => entry.attendeeId !== args.attendeeId,
      );
      if (args.value) {
        entries.push({
          value: args.value,
          attendeeId: args.attendeeId,
          attendeeDisplayName: args.attendeeDisplayName,
          isSelf: args.isSelf,
        });
      }

      await this.prisma.messagingMessage.update({
        where: { id: args.messagingMessageId },
        data: { reactions: entries },
      });
    });
  }

  @BypassTenantGuard
  async updateMessageEditedUnscoped(args: RepoArgs<ProcessMessagingWebhookRepo, "updateMessageEditedUnscoped">) {
    await this.prisma.messagingMessage.update({
      where: { id: args.messagingMessageId },
      data: {
        bodyText: args.bodyText,
        editedAt: args.editedAt,
      },
    });
  }

  @BypassTenantGuard
  async updateMessageDeletedUnscoped(args: RepoArgs<ProcessMessagingWebhookRepo, "updateMessageDeletedUnscoped">) {
    await this.prisma.messagingMessage.update({
      where: { id: args.messagingMessageId },
      data: { deletedAt: args.deletedAt },
    });
  }

  @BypassTenantGuard
  async applyThreadStateUnscoped(args: RepoArgs<ProcessEmailWebhookRepo, "applyThreadStateUnscoped">) {
    await this.prisma.messagingThread.update({
      where: { id: args.messagingThreadId },
      data: { state: args.state },
    });
  }

  @BypassTenantGuard
  async insertAccountActivityUnscoped(args: RepoArgs<ProcessUsersWebhookRepo, "insertAccountActivityUnscoped">) {
    await this.prisma.accountActivity.createMany({
      data: [
        {
          companyId: args.companyId,
          connectedAccountId: args.connectedAccountId,
          identifier: args.identifier,
          kind: args.kind,
          payload: args.payload as Prisma.InputJsonValue,
          occurredAt: args.occurredAt,
        },
      ],
      skipDuplicates: true,
    });
  }
}

// Ingest deliberately runs as plain autocommit: wrapping the message firehose in an interactive
// transaction pins one pooled connection across the whole body and exhausts the pool (P2028) under
// concurrent backfill + webhook load, so there is normally no transaction or retry around ingest.
// The participant write is the one exception. MessagingThreadParticipant carries TWO unique
// constraints, (threadId, attendeeId) and (threadId, identifier), but a Postgres upsert can only
// arbitrate ONE (we target attendeeId), so a concurrent same-thread ingest can still hit P2002 on the
// identifier key. Those concurrent ingests come from live traffic, not a single backfill (which is
// sequential): e.g. two webhook deliveries for the same chat landing within milliseconds, or a live
// message webhook arriving while that same thread is still being backfilled. We keep the DB guarantee
// (no constraint drop, no swallow) and avoid a transaction
// (which would reintroduce the pool exhaustion above); instead we retry — the re-run re-reads the
// now-committed row and routes it to the reconcile/update branch, converging within a few attempts.
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
    sender: cleanAttendee(message.sender),
    recipients: {
      to: message.recipients.to.map(cleanAttendee),
      cc: message.recipients.cc.map(cleanAttendee),
      bcc: message.recipients.bcc.map(cleanAttendee),
    },
  };
}
