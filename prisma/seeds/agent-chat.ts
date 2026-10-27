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
  "Here are the open deals worth your attention this quarter, ranked by weighted value:",
  "",
  "| Deal | Organization | Stage | Value |",
  "| --- | --- | --- | --- |",
  "| Northgate Logistics – warehouse network and support | Northgate Logistics | Conversation | $16,000 |",
  "| Kessler Dental – managed support renewal | Kessler Dental Practice | Proposal sent | $6,720 |",
  "| Maple & Finch – office network setup | Maple & Finch Law | Proposal sent | $3,950 |",
  "| Oakridge Property – support for three offices | Oakridge Property Management | New | $7,680 |",
  "| Harbourview Hotel – managed support | Harbourview Hotel | New | $5,760 |",
  "",
  "Two things stand out: the Kessler renewal is due this month and Hannah still wants the updated workstation count, and the Northgate site visit is the step that decides your largest deal. I would send the Kessler summary first and prepare the walkthrough with Ethan.",
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
        text: "I reviewed all 18 contacts and found no exact duplicates. Two entries share the Kessler Dental Practice account: Hannah Kessler and Liam Carter. They have different email addresses and roles, so they look like genuinely different people rather than duplicates.",
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
        text: "You have three tasks due soon: the Kessler renewal summary, the visit to Megan's new shop at Willow Street Bakery and the walkthrough at Harbourview Hotel. The Kessler renewal is attached to a deal in Proposal sent, so I would start there.",
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
        text: "Your pipeline holds 9 open deals worth about $51,000 in total, or about $16,400 weighted by stage. The largest share sits in Conversation with Northgate, while three deals in New have no reply from the customer yet. Giving each of those a dated next step would make the pipeline more reliable.",
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
}
