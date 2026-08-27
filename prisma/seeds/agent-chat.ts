import type { Prisma } from "@/generated/prisma";
import type { SeedContext } from "./context";

import { fixtureId } from "./helpers";

const MINUTE = 60_000;

type SeedMessage = { role: "user" | "assistant"; text: string };

type SeedConversation = {
  index: number;
  title: string;
  archived: boolean;
  endedMinutesAgo: number;
  messages: SeedMessage[];
};

const ACTIVE_ANSWER = [
  "Here are the open opportunities worth your attention this quarter, ranked by weighted value:",
  "",
  "| Opportunity | Account | Stage | Value |",
  "| --- | --- | --- | --- |",
  "| Cloud Infrastructure Migration | Continental | Qualified | €340,000 |",
  "| Data & Analytics Transformation | Deutsche Telekom | In Progress | €265,000 |",
  "| CRM Rollout & Sales Enablement | Roche | Qualified | €180,000 |",
  "| Digital Customer Platform | BMW | New | €150,000 |",
  "| Enterprise Integration Program | Hays | In Progress | €120,000 |",
  "",
  "Two things stand out: the Continental migration has had no activity for eleven days despite being your largest qualified deal, and both In Progress opportunities have tasks overdue this week. I would start with a check-in on Continental and clear the overdue tasks on Deutsche Telekom.",
].join("\n");

const CONVERSATIONS: SeedConversation[] = [
  {
    index: 1,
    title: "Which opportunities should I focus on this quarter?",
    archived: false,
    endedMinutesAgo: 90,
    messages: [
      { role: "user", text: "Which opportunities should I focus on this quarter?" },
      { role: "assistant", text: ACTIVE_ANSWER },
    ],
  },
  {
    index: 2,
    title: "Find contacts that look like duplicates",
    archived: true,
    endedMinutesAgo: 26 * 60,
    messages: [
      { role: "user", text: "Find contacts that look like duplicates" },
      {
        role: "assistant",
        text: "I reviewed all 30 contacts and found no exact duplicates. Two entries share the Continental account with similar roles: Felix Koch and Jonas Weber. Both have distinct email addresses and phone numbers, so they look like genuinely different people rather than duplicates.",
      },
    ],
  },
  {
    index: 3,
    title: "What should I work on today?",
    archived: true,
    endedMinutesAgo: 50 * 60,
    messages: [
      { role: "user", text: "What should I work on today?" },
      {
        role: "assistant",
        text: "You have three tasks due today: preparing the Roche renewal summary, the follow-up call with Anna Müller, and reviewing the Wavestone proposal. The Roche renewal is attached to a qualified opportunity, so I would start there.",
      },
    ],
  },
  {
    index: 4,
    title: "How healthy is my pipeline?",
    archived: true,
    endedMinutesAgo: 74 * 60,
    messages: [
      { role: "user", text: "How healthy is my pipeline?" },
      {
        role: "assistant",
        text: "Your pipeline holds 20 open opportunities worth €2.1M in total. 40% of the value sits in the Qualified stage, which is a solid position, but five opportunities in New have had no activity for over two weeks. Reviving or closing those would give you a more honest forecast.",
      },
    ],
  },
];

export async function seedAgentConversations(context: SeedContext): Promise<void> {
  const { prisma, ids } = context;
  const now = Date.now();

  for (const conversation of CONVERSATIONS) {
    const conversationId = fixtureId("27000000", conversation.index);
    const endedAt = new Date(now - conversation.endedMinutesAgo * MINUTE);
    const startedAt = new Date(endedAt.getTime() - 2 * MINUTE);
    const row = {
      companyId: ids.company,
      userId: ids.user,
      title: conversation.title,
      archivedAt: conversation.archived ? endedAt : null,
      selectedAt: conversation.archived ? null : endedAt,
      createdAt: startedAt,
      updatedAt: endedAt,
    };

    await prisma.agentConversation.upsert({
      where: { id: conversationId },
      update: row,
      create: { id: conversationId, ...row },
    });

    for (const [messageIndex, message] of conversation.messages.entries()) {
      const messageId = fixtureId("28000000", conversation.index * 100 + messageIndex + 1);
      const messageRow = {
        conversationId,
        companyId: ids.company,
        role: message.role,
        parts: [{ type: "text", text: message.text }] as Prisma.InputJsonValue,
        sequence: BigInt(conversation.index * 100 + messageIndex + 1),
        createdAt: new Date(startedAt.getTime() + messageIndex * MINUTE),
      };

      await prisma.agentMessage.upsert({
        where: { id: messageId },
        update: messageRow,
        create: { id: messageId, ...messageRow },
      });
    }
  }

  await prisma.$executeRaw`SELECT setval(pg_get_serial_sequence('"AgentMessage"', 'sequence'), (SELECT COALESCE(MAX(sequence), 1) FROM "AgentMessage"))`;
}
