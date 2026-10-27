import { createHash } from "node:crypto";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { PLANNER_P13N_ID, PlannerConfigSchema } from "@/features/planner/planner.schema";
import { presetId } from "@/features/records/crm-preset";
import { encodeRecordValue } from "@/features/records/record-storage";
import { TRASH_RETENTION_DAYS } from "@/features/trash/trash-retention";
import { Prisma, type PrismaClient } from "@/generated/prisma";

import { workspaceFixtureId } from "../helpers";
import { storyMoment } from "../timeline";
import type { SolutionContent } from "./define-solution";
import type { SolutionWorkspace } from "./solution-workspaces";

const DAY = 86_400_000;
const MINUTE = 60_000;

const PLANNER_GROUP = "4e200000";
const PLANNER_SOURCE_GROUP = "4e300000";
const FEED_GROUP = "4e400000";
const TRASH_RECORD_GROUP = "4d000000";
const TRASH_ITEM_GROUP = "4d200000";
const TRASH_BATCH_GROUP = "4d300000";
const CONVERSATION_GROUP = "27000000";
const MESSAGE_GROUP = "28000000";

/** The connected calendar the messaging seed stores for a workspace with a Google or Outlook account. */
function connectedCalendarId(workspace: SolutionWorkspace): string {
  return workspaceFixtureId("24000000", workspace.tag, 1);
}

/**
 * Max's combined calendar: the solution's record sources (a list's date field, optional end, filters and colour) and
 * the connected calendar when the workspace has one, in the solution's mode and time zone. A workspace without a
 * planner keeps the empty default.
 */
export async function seedSolutionPlanner(
  prisma: PrismaClient,
  workspace: SolutionWorkspace,
  content: SolutionContent,
): Promise<void> {
  const { companyId } = workspace;
  const userId = workspace.memberId;
  const where = { companyId_userId_p13nId: { companyId, userId, p13nId: PLANNER_P13N_ID } };
  if (!content.planner) {
    await prisma.p13n.deleteMany({ where: { companyId, userId, p13nId: PLANNER_P13N_ID } });
    return;
  }
  const id = (key: string) => presetId(companyId, key);
  const field = (list: string, key: string) => (key.startsWith("system:") ? key : id(`${list}.${key}`));
  const hasCalendar =
    content.planner.connectedCalendar === true &&
    (await prisma.calendar.count({ where: { companyId, id: connectedCalendarId(workspace) } })) > 0;
  const settings = PlannerConfigSchema.parse({
    sources: content.planner.sources.map((source, index) => ({
      id: workspaceFixtureId(PLANNER_SOURCE_GROUP, workspace.tag, index + 1),
      typeId: id(source.list),
      calendar: {
        dateFieldId: field(source.list, source.date),
        ...(source.end ? { endDateFieldId: field(source.list, source.end) } : {}),
      },
      filters: (source.filters ?? []).map((filter) => ({
        field: field(source.list, filter.field),
        operator: filter.notIn ? FilterOperatorKey.notIn : FilterOperatorKey.in,
        value: (filter.notIn ?? filter.in ?? []).map((key) => id(`${source.list}.${filter.field}.${key}`)),
      })),
      enabled: true,
      color: source.color,
    })),
    calendarIds: hasCalendar ? [connectedCalendarId(workspace)] : [],
    timeZone: content.timeZone,
    mode: content.planner.mode,
  });
  const data = { companyId, userId, p13nId: PLANNER_P13N_ID, settings };
  await prisma.p13n.upsert({
    where,
    create: { id: workspaceFixtureId(PLANNER_GROUP, workspace.tag, 1), ...data },
    update: data,
  });

  const feedId = workspaceFixtureId(FEED_GROUP, workspace.tag, 1);
  if (content.planner.feed) {
    const feed = {
      companyId,
      userId,
      tokenHash: createHash("sha256").update(`demo-calendar-feed:${workspace.tag}`).digest("hex"),
      config: settings as Prisma.InputJsonValue,
      includePersonalEvents: false,
      createdAt: storyMoment(21),
    };
    await prisma.calendarSubscription.upsert({ where: { id: feedId }, create: { id: feedId, ...feed }, update: feed });
  } else await prisma.calendarSubscription.deleteMany({ where: { companyId, id: feedId } });
}

/**
 * Records Max deleted in the last weeks, waiting in Trash: each gets its name (a contact its first and last name),
 * a Trash item within the retention period and its own batch. The team workspace keeps its own Trash fixtures.
 */
export async function seedSolutionTrash(
  prisma: PrismaClient,
  workspace: SolutionWorkspace,
  content: SolutionContent,
): Promise<void> {
  if (workspace.team) return;
  const { companyId, tag } = workspace;
  const id = (key: string) => presetId(companyId, key);
  const items = (content.trash ?? []).map((spec, index) => ({
    ...spec,
    recordId: workspaceFixtureId(TRASH_RECORD_GROUP, tag, index + 1),
    itemId: workspaceFixtureId(TRASH_ITEM_GROUP, tag, index + 1),
    batchId: workspaceFixtureId(TRASH_BATCH_GROUP, tag, index + 1),
    deletedAt: storyMoment(spec.daysAgo, 90 + index * 13),
  }));
  await prisma.$transaction(
    async (tx) => {
      await tx.trashItem.deleteMany({ where: { companyId, id: { startsWith: `${TRASH_ITEM_GROUP}-${tag}-` } } });
      await tx.crmRecord.deleteMany({ where: { companyId, id: { startsWith: `${TRASH_RECORD_GROUP}-${tag}-` } } });
      if (!items.length) return;
      const state = await tx.recordSchemaState.findUniqueOrThrow({ where: { companyId } });
      for (const item of items) {
        const typeId = id(item.list);
        await tx.crmRecord.create({
          data: {
            companyId,
            typeId,
            id: item.recordId,
            createdAt: new Date(item.deletedAt.getTime() - 20 * DAY),
            updatedAt: item.deletedAt,
            deletedAt: item.deletedAt,
            trashItemId: item.itemId,
          },
        });
        const [firstName, ...rest] = item.name.split(" ");
        const values: Array<[string, string]> =
          item.list === "contact"
            ? [
                ["contact.firstName", firstName],
                ["contact.lastName", rest.join(" ")],
                ["contact.name", item.name],
              ]
            : [[`${item.list}.name`, item.name]];
        for (const [fieldKey, text] of values) {
          if (!text) continue;
          const encoded = encodeRecordValue({ state: "value", value: { kind: "text", value: text } });
          await tx.recordValue.create({
            data: {
              companyId,
              typeId,
              recordId: item.recordId,
              fieldId: id(fieldKey),
              ...encoded,
              jsonValue: encoded.jsonValue ?? Prisma.DbNull,
              schemaRevision: state.revision,
            },
          });
        }
      }
      await tx.trashItem.createMany({
        data: items.map((item) => ({
          companyId,
          id: item.itemId,
          kind: "record" as const,
          targetId: item.recordId,
          typeId: id(item.list),
          label: item.name,
          deletedById: workspace.memberId,
          deletedAt: item.deletedAt,
          expiresAt: new Date(item.deletedAt.getTime() + TRASH_RETENTION_DAYS * DAY),
          batchId: item.batchId,
        })),
      });
    },
    { maxWait: 60000, timeout: 600000 },
  );
}

/**
 * Finished Mate conversations of Max, the newest one selected. The team workspace keeps its own conversations.
 */
export async function seedSolutionMateChats(
  prisma: PrismaClient,
  workspace: SolutionWorkspace,
  content: SolutionContent,
): Promise<void> {
  if (workspace.team) return;
  const { companyId, tag } = workspace;
  const chats = content.mateChats ?? [];
  const conversationIds = chats.map((_, index) => workspaceFixtureId(CONVERSATION_GROUP, tag, index + 1));
  await prisma.agentConversation.deleteMany({
    where: { companyId, id: { startsWith: `${CONVERSATION_GROUP}-${tag}-`, notIn: conversationIds } },
  });
  const newest = Math.min(...chats.map((chat) => chat.endedHoursAgo));
  for (const [index, chat] of chats.entries()) {
    const conversationId = conversationIds[index];
    const endedAt = storyMoment(0, chat.endedHoursAgo * 60);
    const startedAt = new Date(endedAt.getTime() - chat.messages.length * MINUTE);
    const row = {
      companyId,
      userId: workspace.memberId,
      title: chat.title,
      archivedAt: chat.endedHoursAgo === newest ? null : endedAt,
      selectedAt: chat.endedHoursAgo === newest ? endedAt : null,
      createdAt: startedAt,
      updatedAt: endedAt,
    };
    await prisma.agentConversation.upsert({
      where: { id: conversationId },
      update: row,
      create: { id: conversationId, ...row },
    });
    await prisma.agentMessage.deleteMany({
      where: { conversationId, id: { startsWith: `${MESSAGE_GROUP}-${tag}-` } },
    });
    await prisma.agentMessage.createMany({
      data: chat.messages.map((message, messageIndex) => ({
        id: workspaceFixtureId(MESSAGE_GROUP, tag, (index + 1) * 100 + messageIndex + 1),
        conversationId,
        companyId,
        role: message.role,
        parts: [{ type: "text", text: message.text }] as Prisma.InputJsonValue,
        sequence: BigInt(messageIndex + 1),
        createdAt: new Date(startedAt.getTime() + messageIndex * MINUTE),
      })),
    });
  }
}
