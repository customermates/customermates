import type { MessagingProvider, Prisma, PrismaClient } from "@/generated/prisma";

import { SYNTHETIC_COMPANY_USERS } from "@/core/config/synthetic-seed-user";

import { SYNTHETIC_AVATAR_PATHS } from "../avatars";
import { fixtureId } from "../helpers";
import { people, threads, type PersonKey, type ThreadFixture } from "./fixtures";

export type SeedContext = {
  companyId: string;
  contactIds: readonly string[];
  seedUserEmail: string;
  userId: string;
};

type DemoAttendee = {
  attendeeId: string;
  displayName: string;
  identifier: string;
  isSelf: boolean;
  headline?: string;
  occupation?: string;
  pictureUrl: string;
  profileUrl?: string;
};

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

function emailHtml(text: string): string {
  const escaped = text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return escaped
    .split("\n\n")
    .map((paragraph) => `<p>${paragraph}</p>`)
    .join("");
}

function providerFor(account: ThreadFixture["account"]): MessagingProvider {
  return account;
}

function personAttendee(personKey: PersonKey, provider: MessagingProvider): DemoAttendee {
  const person = people[personKey];
  const identifier =
    provider === "google"
      ? person.email
      : provider === "linkedin"
        ? person.linkedin
        : provider === "whatsapp"
          ? person.phone
          : undefined;

  if (!identifier) throw new Error(`Missing ${provider} demo identifier for ${personKey}`);

  return {
    attendeeId: `demo-${provider}-${personKey}`,
    displayName: person.displayName,
    identifier,
    isSelf: false,
    headline: person.headline,
    occupation: person.occupation,
    pictureUrl: person.avatarPath,
    profileUrl: person.profileUrl,
  };
}

function selfAttendee(provider: MessagingProvider, seedUserEmail: string): DemoAttendee {
  const identifier =
    provider === "google" ? seedUserEmail : provider === "linkedin" ? "max-bergmann.linkedin.example" : "+12025550199";

  return {
    attendeeId: `demo-${provider}-self`,
    displayName: SYNTHETIC_COMPANY_USERS.maxBergmann.name,
    identifier,
    isSelf: true,
    occupation: "Account Manager at Customermates",
    pictureUrl: SYNTHETIC_AVATAR_PATHS.maxBergmann,
    profileUrl: provider === "linkedin" ? "https://linkedin.example/in/max-bergmann" : undefined,
  };
}

function inputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export async function seedDemoMessagingFixtures(prisma: PrismaClient, context: SeedContext): Promise<void> {
  const anchorWindow = 5 * MINUTE;
  const anchor = new Date(Math.floor(Date.now() / anchorWindow) * anchorWindow);
  const accountIds = {
    google: fixtureId("16000000", 1),
    linkedin: fixtureId("16000000", 2),
    whatsapp: fixtureId("16000000", 3),
  } as const;
  const desiredAccountIds = Object.values(accountIds);
  const desiredContactIdentifierIds: string[] = [];
  const desiredMessageIds: string[] = [];
  const desiredParticipantIds: string[] = [];
  const desiredThreadIds: string[] = [];
  const googleThreads = threads.filter((thread) => thread.account === "google");
  const googleInboundCount = googleThreads.reduce(
    (count, thread) => count + thread.messages.filter((message) => message.sender !== "self").length,
    0,
  );
  const googleSentCount = googleThreads.reduce(
    (count, thread) => count + thread.messages.filter((message) => message.sender === "self").length,
    0,
  );

  const accounts = [
    {
      id: accountIds.google,
      unipileAccountId: "demo-fixture-google-account",
      provider: "google" as const,
      emailAddress: context.seedUserEmail,
      displayName: `${SYNTHETIC_COMPANY_USERS.maxBergmann.name} · Gmail`,
      hasCalendar: true,
      folders: [
        {
          id: "demo-google-inbox",
          name: "Inbox",
          role: "INBOX",
          totalCount: googleInboundCount,
          unreadCount: googleThreads.filter((thread) => thread.state === "unread").length,
        },
        {
          id: "demo-google-sent",
          name: "Sent",
          role: "SENT",
          totalCount: googleSentCount,
          unreadCount: 0,
        },
      ],
      selectedFolderIds: ["demo-google-inbox", "demo-google-sent"],
      sentFolderIds: ["demo-google-sent"],
      linkedinProducts: [] as string[],
    },
    {
      id: accountIds.linkedin,
      unipileAccountId: "demo-fixture-linkedin-account",
      provider: "linkedin" as const,
      emailAddress: null,
      displayName: `${SYNTHETIC_COMPANY_USERS.maxBergmann.name} · LinkedIn`,
      hasCalendar: false,
      folders: [],
      selectedFolderIds: [] as string[],
      sentFolderIds: [] as string[],
      linkedinProducts: ["classic"],
    },
    {
      id: accountIds.whatsapp,
      unipileAccountId: "demo-fixture-whatsapp-account",
      provider: "whatsapp" as const,
      emailAddress: null,
      displayName: `${SYNTHETIC_COMPANY_USERS.maxBergmann.name} · WhatsApp`,
      hasCalendar: false,
      folders: [],
      selectedFolderIds: [] as string[],
      sentFolderIds: [] as string[],
      linkedinProducts: [] as string[],
    },
  ];

  for (const account of accounts) {
    const data = {
      companyId: context.companyId,
      userId: context.userId,
      provider: account.provider,
      status: "ok" as const,
      hasMessaging: true,
      hasCalendar: account.hasCalendar,
      emailAddress: account.emailAddress,
      displayName: account.displayName,
      sentFolderIds: account.sentFolderIds,
      folders: inputJson(account.folders),
      selectedFolderIds: account.selectedFolderIds,
      foldersSyncedAt: account.provider === "google" ? new Date(anchor.getTime() - 5 * MINUTE) : null,
      linkedinProducts: account.linkedinProducts,
      shared: false,
      syncing: false,
      ownerAvatarUrl: SYNTHETIC_AVATAR_PATHS.maxBergmann,
      lastSyncedAt: new Date(anchor.getTime() - 5 * MINUTE),
    };

    await prisma.connectedAccount.upsert({
      where: { unipileAccountId: account.unipileAccountId },
      update: data,
      create: {
        ...data,
        id: account.id,
        unipileAccountId: account.unipileAccountId,
        createdAt: new Date(anchor.getTime() - 30 * DAY),
      },
    });
  }

  const channelPeople: Array<{
    key: PersonKey;
    provider: "linkedin" | "whatsapp";
  }> = [
    { key: "leon", provider: "linkedin" },
    { key: "rashid", provider: "linkedin" },
    { key: "sophie", provider: "whatsapp" },
    { key: "jonas", provider: "whatsapp" },
  ];

  for (const [index, channel] of channelPeople.entries()) {
    const attendee = personAttendee(channel.key, channel.provider);
    const person = people[channel.key];
    if (person.contactIndex === null) throw new Error(`Missing linked demo contact index for ${channel.key}`);

    const data = {
      companyId: context.companyId,
      contactId: context.contactIds[person.contactIndex],
      provider: channel.provider,
      channelClass: channel.provider === "whatsapp" ? "phone" : "linkedin",
      value: attendee.identifier,
      messagingId: channel.provider === "linkedin" ? attendee.attendeeId : null,
      displayName: attendee.displayName,
      profileUrl: attendee.profileUrl ?? null,
    };

    if (!data.contactId) throw new Error(`Missing demo contact for ${channel.key}`);

    const id = fixtureId("1a000000", index + 1);
    desiredContactIdentifierIds.push(id);
    await prisma.contactIdentifier.upsert({
      where: { id },
      update: data,
      create: { ...data, id },
    });
  }

  let participantIndex = 0;
  let messageIndex = 0;

  for (const [threadIndex, fixture] of threads.entries()) {
    const provider = providerFor(fixture.account);
    const connectedAccountId = accountIds[fixture.account];
    const threadId = fixtureId("17000000", threadIndex + 1);
    desiredThreadIds.push(threadId);
    const self = selfAttendee(provider, context.seedUserEmail);
    const counterparts = fixture.participants.map((key) => personAttendee(key, provider));
    const attendees = [self, ...counterparts];
    const latestAt = new Date(anchor.getTime() - fixture.latestMinutesAgo * MINUTE);
    const lastMessage = fixture.messages.at(-1);

    if (!lastMessage) throw new Error("Every demo thread must contain a message");

    await prisma.messagingThread.upsert({
      where: {
        connectedAccountId_unipileThreadId: {
          connectedAccountId,
          unipileThreadId: `demo-fixture-thread-${threadIndex + 1}`,
        },
      },
      update: {
        companyId: context.companyId,
        provider,
        state: fixture.state,
        type: fixture.type,
        name: fixture.name,
        subject: fixture.subject,
        lastMessageAt: latestAt,
        lastMessagePreview: lastMessage.text,
        lastMessageIsSender: lastMessage.sender === "self",
        sharedToCrm: true,
      },
      create: {
        id: threadId,
        companyId: context.companyId,
        connectedAccountId,
        state: fixture.state,
        type: fixture.type,
        name: fixture.name,
        unipileThreadId: `demo-fixture-thread-${threadIndex + 1}`,
        provider,
        subject: fixture.subject,
        lastMessageAt: latestAt,
        lastMessagePreview: lastMessage.text,
        lastMessageIsSender: lastMessage.sender === "self",
        sharedToCrm: true,
        createdAt: new Date(latestAt.getTime() - (fixture.messages.length - 1) * 45 * MINUTE),
      },
    });

    for (const attendee of attendees) {
      participantIndex += 1;
      const participantId = fixtureId("18000000", participantIndex);
      desiredParticipantIds.push(participantId);
      await prisma.messagingThreadParticipant.upsert({
        where: { id: participantId },
        update: {
          companyId: context.companyId,
          messagingThreadId: threadId,
          provider,
          providerUserId: attendee.attendeeId,
          identifier: attendee.identifier,
          displayName: attendee.displayName,
          pictureUrl: attendee.pictureUrl,
          profileUrl: attendee.profileUrl ?? null,
          headline: attendee.headline ?? null,
          occupation: attendee.occupation ?? null,
          isSelf: attendee.isSelf,
        },
        create: {
          id: participantId,
          companyId: context.companyId,
          messagingThreadId: threadId,
          provider,
          providerUserId: attendee.attendeeId,
          identifier: attendee.identifier,
          displayName: attendee.displayName,
          pictureUrl: attendee.pictureUrl,
          profileUrl: attendee.profileUrl ?? null,
          headline: attendee.headline ?? null,
          occupation: attendee.occupation ?? null,
          isSelf: attendee.isSelf,
        },
      });
    }

    for (const [localMessageIndex, message] of fixture.messages.entries()) {
      messageIndex += 1;
      const messageId = fixtureId("19000000", messageIndex);
      desiredMessageIds.push(messageId);
      const sender = message.sender === "self" ? self : personAttendee(message.sender, provider);
      const recipientAttendees = attendees.filter((attendee) => attendee.attendeeId !== sender.attendeeId);
      const sentAt = new Date(latestAt.getTime() - (fixture.messages.length - 1 - localMessageIndex) * 45 * MINUTE);
      const reactionSender = message.reaction
        ? message.reaction.sender === "self"
          ? self
          : personAttendee(message.reaction.sender, provider)
        : null;
      const unipileMessageId = `demo-fixture-message-${messageIndex}`;
      const data = {
        companyId: context.companyId,
        connectedAccountId,
        messagingThreadId: threadId,
        provider,
        providerMessageId: provider === "google" ? `demo-provider-message-${messageIndex}` : null,
        direction: message.sender === "self" ? ("outbound" as const) : ("inbound" as const),
        origin: "external" as const,
        sender: inputJson(sender),
        senderIdentifier: sender.identifier,
        recipients: inputJson({ to: recipientAttendees, cc: [], bcc: [] }),
        reactions: inputJson(
          message.reaction && reactionSender
            ? [
                {
                  value: message.reaction.value,
                  attendeeId: reactionSender.attendeeId,
                  attendeeDisplayName: reactionSender.displayName,
                  isSelf: reactionSender.isSelf,
                },
              ]
            : [],
        ),
        subject: fixture.subject,
        bodyText: message.text,
        bodyHtml: provider === "google" ? emailHtml(message.text) : null,
        attachmentsMeta: inputJson([]),
        folderIds:
          provider === "google" ? (message.sender === "self" ? ["demo-google-sent"] : ["demo-google-inbox"]) : [],
        isEvent: false,
        isDeleted: false,
        isHidden: false,
        isDraft: false,
        sentAt,
        editedAt: null,
        unipileMessageId,
      };

      await prisma.messagingMessage.upsert({
        where: { id: messageId },
        update: data,
        create: {
          ...data,
          id: messageId,
          createdAt: sentAt,
        },
      });
    }
  }

  await prisma.messagingMessage.deleteMany({
    where: {
      companyId: context.companyId,
      id: { startsWith: "19000000-", notIn: desiredMessageIds },
    },
  });
  await prisma.messagingThreadParticipant.deleteMany({
    where: {
      companyId: context.companyId,
      id: { startsWith: "18000000-", notIn: desiredParticipantIds },
    },
  });
  await prisma.messagingThread.deleteMany({
    where: {
      companyId: context.companyId,
      id: { startsWith: "17000000-", notIn: desiredThreadIds },
    },
  });
  await prisma.contactIdentifier.deleteMany({
    where: {
      companyId: context.companyId,
      id: { startsWith: "1a000000-", notIn: desiredContactIdentifierIds },
    },
  });
  await prisma.connectedAccount.deleteMany({
    where: {
      companyId: context.companyId,
      id: { startsWith: "16000000-", notIn: desiredAccountIds },
    },
  });
}
