import type { MessagingProvider, Prisma, PrismaClient } from "@/generated/prisma";

import { SYNTHETIC_COMPANY_USERS } from "@/core/config/synthetic-seed-user";

import { SYNTHETIC_AVATAR_URLS } from "../avatars";
import { fixtureId } from "../helpers";
import { SYNTHETIC_SEED_TIMELINE } from "../timeline";
import {
  accountActivityFixtures,
  calendarFixture,
  people,
  threads,
  type PersonKey,
  type ThreadFixture,
} from "./fixtures";

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
const EMAIL_FOLDER_IDS = {
  google: { inbox: "demo-google-inbox", sent: "demo-google-sent" },
  outlook: { inbox: "demo-outlook-inbox", sent: "demo-outlook-sent" },
} as const;

type EmailFixtureProvider = keyof typeof EMAIL_FOLDER_IDS;

function isEmailFixtureProvider(provider: MessagingProvider): provider is EmailFixtureProvider {
  return provider === "google" || provider === "outlook";
}

function emailHtml(text: string): string {
  const escaped = text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return escaped
    .split("\n\n")
    .map((paragraph) => `<p>${paragraph}</p>`)
    .join("");
}

function providerFor(account: ThreadFixture["account"]): ThreadFixture["account"] {
  return account;
}

function personAttendee(personKey: PersonKey, provider: ThreadFixture["account"]): DemoAttendee {
  const person = people[personKey];
  const identifier =
    provider === "google" || provider === "outlook"
      ? person.email
      : provider === "linkedin"
        ? person.linkedin
        : provider === "whatsapp"
          ? person.phone
          : provider === "instagram"
            ? person.instagram
            : person.telegram;
  const profileUrl =
    provider === "linkedin"
      ? person.profileUrl
      : provider === "instagram"
        ? person.instagramProfileUrl
        : provider === "telegram"
          ? person.telegramProfileUrl
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
    profileUrl,
  };
}

function selfAttendee(provider: ThreadFixture["account"], seedUserEmail: string): DemoAttendee {
  const identities: Record<ThreadFixture["account"], { identifier: string; profileUrl?: string }> = {
    google: { identifier: seedUserEmail },
    instagram: {
      identifier: "max.bergmann",
      profileUrl: "https://instagram.example/max-bergmann",
    },
    linkedin: {
      identifier: "max-bergmann.linkedin.example",
      profileUrl: "https://linkedin.example/in/max-bergmann",
    },
    outlook: { identifier: seedUserEmail },
    telegram: {
      identifier: "max_bergmann",
      profileUrl: "https://telegram.example/max-bergmann",
    },
    whatsapp: { identifier: "+12025550199" },
  };
  const identity = identities[provider];

  return {
    attendeeId: `demo-${provider}-self`,
    displayName: SYNTHETIC_COMPANY_USERS.maxBergmann.name,
    identifier: identity.identifier,
    isSelf: true,
    occupation: "Account Manager at Customermates",
    pictureUrl: SYNTHETIC_AVATAR_URLS.maxBergmann,
    profileUrl: identity.profileUrl,
  };
}

function emailFolderIds(provider: MessagingProvider, senderIsSelf: boolean): string[] {
  if (!isEmailFixtureProvider(provider)) return [];
  const folders = EMAIL_FOLDER_IDS[provider];
  return [senderIsSelf ? folders.sent : folders.inbox];
}

function inputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export async function seedDemoMessagingFixtures(prisma: PrismaClient, context: SeedContext): Promise<void> {
  const accountIds = {
    google: fixtureId("16000000", 1),
    linkedin: fixtureId("16000000", 2),
    whatsapp: fixtureId("16000000", 3),
    instagram: fixtureId("16000000", 4),
    telegram: fixtureId("16000000", 5),
    outlook: fixtureId("16000000", 6),
  } as const;
  const seededAccountIds: Record<keyof typeof accountIds, string> = {
    ...accountIds,
  };
  const desiredAccountIds: string[] = [];
  const persistedAnchor = await prisma.connectedAccount.findFirst({
    where: {
      companyId: context.companyId,
      unipileAccountId: {
        in: [
          "demo-fixture-google-account",
          "demo-fixture-linkedin-account",
          "demo-fixture-whatsapp-account",
          "demo-fixture-instagram-account",
          "demo-fixture-telegram-account",
          "demo-fixture-outlook-account",
        ],
      },
      lastSyncedAt: { not: null },
    },
    orderBy: { id: "asc" },
    select: { lastSyncedAt: true },
  });
  const anchorWindow = 5 * MINUTE;
  const anchor = persistedAnchor?.lastSyncedAt
    ? new Date(persistedAnchor.lastSyncedAt.getTime() + 5 * MINUTE)
    : new Date(Math.floor(Date.now() / anchorWindow) * anchorWindow);
  const googleThreads = threads.filter((thread) => thread.account === "google");
  const googleInboundCount = googleThreads.reduce(
    (count, thread) => count + thread.messages.filter((message) => message.sender !== "self").length,
    0,
  );
  const googleSentCount = googleThreads.reduce(
    (count, thread) => count + thread.messages.filter((message) => message.sender === "self").length,
    0,
  );
  const outlookThreads = threads.filter((thread) => thread.account === "outlook");
  const outlookInboundCount = outlookThreads.reduce(
    (count, thread) => count + thread.messages.filter((message) => message.sender !== "self").length,
    0,
  );
  const outlookSentCount = outlookThreads.reduce(
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
    {
      id: accountIds.instagram,
      unipileAccountId: "demo-fixture-instagram-account",
      provider: "instagram" as const,
      emailAddress: null,
      displayName: `${SYNTHETIC_COMPANY_USERS.maxBergmann.name} · Instagram`,
      hasCalendar: false,
      folders: [],
      selectedFolderIds: [] as string[],
      sentFolderIds: [] as string[],
      linkedinProducts: [] as string[],
    },
    {
      id: accountIds.telegram,
      unipileAccountId: "demo-fixture-telegram-account",
      provider: "telegram" as const,
      emailAddress: null,
      displayName: `${SYNTHETIC_COMPANY_USERS.maxBergmann.name} · Telegram`,
      hasCalendar: false,
      folders: [],
      selectedFolderIds: [] as string[],
      sentFolderIds: [] as string[],
      linkedinProducts: [] as string[],
    },
    {
      id: accountIds.outlook,
      unipileAccountId: "demo-fixture-outlook-account",
      provider: "outlook" as const,
      emailAddress: context.seedUserEmail,
      displayName: `${SYNTHETIC_COMPANY_USERS.maxBergmann.name} · Outlook`,
      hasCalendar: true,
      folders: [
        {
          id: EMAIL_FOLDER_IDS.outlook.inbox,
          name: "Inbox",
          role: "INBOX",
          totalCount: outlookInboundCount,
          unreadCount: outlookThreads.filter((thread) => thread.state === "unread").length,
        },
        {
          id: EMAIL_FOLDER_IDS.outlook.sent,
          name: "Sent",
          role: "SENT",
          totalCount: outlookSentCount,
          unreadCount: 0,
        },
      ],
      selectedFolderIds: [EMAIL_FOLDER_IDS.outlook.inbox, EMAIL_FOLDER_IDS.outlook.sent],
      sentFolderIds: [EMAIL_FOLDER_IDS.outlook.sent],
      linkedinProducts: [] as string[],
    },
  ];

  for (const [index, account] of accounts.entries()) {
    const accountTimeline = SYNTHETIC_SEED_TIMELINE.connectedAccount(index);
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
      foldersSyncedAt: isEmailFixtureProvider(account.provider) ? new Date(anchor.getTime() - 5 * MINUTE) : null,
      linkedinProducts: account.linkedinProducts,
      shared: false,
      syncing: false,
      ownerAvatarUrl: SYNTHETIC_AVATAR_URLS.maxBergmann,
      lastSyncedAt: new Date(anchor.getTime() - 5 * MINUTE),
    };

    const seededAccount = await prisma.connectedAccount.upsert({
      where: { unipileAccountId: account.unipileAccountId },
      update: {
        ...data,
        ...accountTimeline,
      },
      create: {
        ...data,
        id: account.id,
        unipileAccountId: account.unipileAccountId,
        ...accountTimeline,
      },
    });
    seededAccountIds[account.provider] = seededAccount.id;
    desiredAccountIds.push(seededAccount.id);
  }

  await prisma.accountActivity.deleteMany({
    where: { companyId: context.companyId, id: { startsWith: "26000000-" } },
  });
  await prisma.calendarEvent.deleteMany({
    where: { companyId: context.companyId, id: { startsWith: "25000000-" } },
  });
  await prisma.calendar.deleteMany({
    where: {
      companyId: context.companyId,
      events: { none: {} },
      id: { startsWith: "24000000-" },
    },
  });

  const calendarData = {
    companyId: context.companyId,
    connectedAccountId: seededAccountIds.google,
    name: calendarFixture.name,
    description: null,
    color: null,
    timezone: calendarFixture.timezone,
  };
  const seededCalendar = await prisma.calendar.upsert({
    where: {
      connectedAccountId_unipileCalendarId: {
        connectedAccountId: seededAccountIds.google,
        unipileCalendarId: calendarFixture.unipileCalendarId,
      },
    },
    update: calendarData,
    create: {
      ...calendarData,
      id: fixtureId("24000000", 1),
      unipileCalendarId: calendarFixture.unipileCalendarId,
    },
  });

  const organizer = {
    email: context.seedUserEmail.toLowerCase(),
    displayName: SYNTHETIC_COMPANY_USERS.maxBergmann.name,
    responseStatus: "yes",
    isOrganizer: true,
  };
  for (const [index, fixture] of calendarFixture.events.entries()) {
    const attendees = fixture.attendees.map(({ person, responseStatus }) => ({
      email: people[person].email?.toLowerCase() ?? "",
      displayName: people[person].displayName,
      responseStatus,
      isOrganizer: false,
    }));
    if (attendees.some(({ email }) => !email)) throw new Error("Missing demo calendar attendee email");

    const startsAt = new Date(anchor.getTime() - fixture.startsMinutesAgo * MINUTE);
    const eventData = {
      companyId: context.companyId,
      connectedAccountId: seededAccountIds.google,
      calendarId: seededCalendar.id,
      title: fixture.title,
      description: null,
      location: null,
      conferenceUrl: null,
      startsAt,
      endsAt: new Date(startsAt.getTime() + fixture.durationMinutes * MINUTE),
      allDay: false,
      timezone: calendarFixture.timezone,
      recurrenceRule: null,
      status: "confirmed" as const,
      visibility: null,
      attendees: inputJson(attendees),
      organizer: inputJson(organizer),
      attendeeEmails: [...new Set([...attendees.map(({ email }) => email), organizer.email])],
    };
    await prisma.calendarEvent.upsert({
      where: {
        connectedAccountId_unipileEventId: {
          connectedAccountId: seededAccountIds.google,
          unipileEventId: fixture.unipileEventId,
        },
      },
      update: eventData,
      create: {
        ...eventData,
        id: fixtureId("25000000", index + 1),
        unipileEventId: fixture.unipileEventId,
      },
    });
  }

  for (const [index, fixture] of accountActivityFixtures.entries()) {
    const activityPerson = people[fixture.person];
    const activityData = {
      companyId: context.companyId,
      connectedAccountId: seededAccountIds.linkedin,
      payload: inputJson({
        fullName: activityPerson.displayName,
        headline: activityPerson.headline,
        profileUrl: activityPerson.profileUrl,
        pictureUrl: activityPerson.avatarPath,
      }),
      occurredAt: new Date(anchor.getTime() - fixture.occurredMinutesAgo * MINUTE),
    };
    await prisma.accountActivity.upsert({
      where: {
        connectedAccountId_kind_identifier: {
          connectedAccountId: seededAccountIds.linkedin,
          kind: fixture.kind,
          identifier: fixture.identifier,
        },
      },
      update: activityData,
      create: {
        ...activityData,
        id: fixtureId("26000000", index + 1),
        identifier: fixture.identifier,
        kind: fixture.kind,
      },
    });
  }

  // Positional fixture IDs can point at different natural keys after fixtures are
  // inserted or reordered. Rebuild only rows in the reserved synthetic namespaces
  // before reconciling natural-key rows that may have been recreated by the UI.
  await prisma.messagingMessage.deleteMany({
    where: { companyId: context.companyId, id: { startsWith: "19000000-" } },
  });
  await prisma.messagingThreadParticipant.deleteMany({
    where: { companyId: context.companyId, id: { startsWith: "18000000-" } },
  });
  await prisma.messagingThread.deleteMany({
    where: {
      companyId: context.companyId,
      id: { startsWith: "17000000-" },
      messages: { none: {} },
      participants: { none: {} },
    },
  });
  await prisma.contactIdentifier.deleteMany({
    where: { companyId: context.companyId, id: { startsWith: "1a000000-" } },
  });

  const channelPeople: Array<{
    key: PersonKey;
    provider: "instagram" | "linkedin" | "telegram" | "whatsapp";
  }> = [
    { key: "leon", provider: "linkedin" },
    { key: "rashid", provider: "linkedin" },
    { key: "sophie", provider: "whatsapp" },
    { key: "jonas", provider: "whatsapp" },
    { key: "yasmin", provider: "instagram" },
    { key: "jonas", provider: "telegram" },
  ];

  for (const [index, channel] of channelPeople.entries()) {
    const attendee = personAttendee(channel.key, channel.provider);
    const person = people[channel.key];
    if (person.contactIndex === null) throw new Error(`Missing linked demo contact index for ${channel.key}`);

    const data = {
      companyId: context.companyId,
      contactId: context.contactIds[person.contactIndex],
      provider: channel.provider,
      channelClass: channel.provider === "whatsapp" ? "phone" : channel.provider,
      value: attendee.identifier,
      messagingId: channel.provider === "whatsapp" ? null : attendee.attendeeId,
      displayName: attendee.displayName,
      profileUrl: attendee.profileUrl ?? null,
    };

    if (!data.contactId) throw new Error(`Missing demo contact for ${channel.key}`);

    const id = fixtureId("1a000000", index + 1);
    const existingIdentifiers = await prisma.contactIdentifier.findMany({
      where: {
        companyId: context.companyId,
        OR: [
          { channelClass: data.channelClass, value: data.value },
          ...(data.messagingId ? [{ provider: data.provider, messagingId: data.messagingId }] : []),
        ],
      },
      select: { id: true },
    });
    if (existingIdentifiers.length > 1)
      throw new Error(`Conflicting demo contact identifiers for ${channel.key} (${channel.provider})`);

    const existingIdentifier = existingIdentifiers[0];
    if (existingIdentifier) {
      await prisma.contactIdentifier.update({
        where: { id: existingIdentifier.id },
        data,
      });
    } else {
      await prisma.contactIdentifier.upsert({
        where: {
          companyId_channelClass_value: {
            companyId: context.companyId,
            channelClass: data.channelClass,
            value: data.value,
          },
        },
        update: data,
        create: { ...data, id },
      });
    }
  }

  let participantIndex = 0;
  let messageIndex = 0;

  for (const [threadIndex, fixture] of threads.entries()) {
    const provider = providerFor(fixture.account);
    const connectedAccountId = seededAccountIds[fixture.account];
    const threadId = fixtureId("17000000", threadIndex + 1);
    const self = selfAttendee(provider, context.seedUserEmail);
    const counterparts = fixture.participants.map((key) => personAttendee(key, provider));
    const attendees = [self, ...counterparts];
    const latestAt = new Date(anchor.getTime() - fixture.latestMinutesAgo * MINUTE);
    const lastMessage = fixture.messages.at(-1);

    if (!lastMessage) throw new Error("Every demo thread must contain a message");

    const threadData = {
      companyId: context.companyId,
      connectedAccountId,
      state: fixture.state,
      type: fixture.type,
      name: fixture.name,
      unipileThreadId: `demo-fixture-thread-${threadIndex + 1}`,
      unipileThreadAltId: null,
      provider,
      subject: fixture.subject,
      lastMessageAt: latestAt,
      lastMessagePreview: lastMessage.text,
      lastMessageIsSender: lastMessage.sender === "self",
      sharedToCrm: true,
      createdAt: new Date(latestAt.getTime() - (fixture.messages.length - 1) * 45 * MINUTE),
    };
    const occupiedThreadId = await prisma.messagingThread.findUnique({
      where: { id: threadId },
      select: { id: true },
    });
    const seededThread = await prisma.messagingThread.upsert({
      where: {
        connectedAccountId_unipileThreadId: {
          connectedAccountId,
          unipileThreadId: `demo-fixture-thread-${threadIndex + 1}`,
        },
      },
      update: threadData,
      create: {
        ...(occupiedThreadId ? {} : { id: threadId }),
        ...threadData,
      },
    });
    for (const attendee of attendees) {
      participantIndex += 1;
      const participantId = fixtureId("18000000", participantIndex);
      const participantData = {
        companyId: context.companyId,
        messagingThreadId: seededThread.id,
        provider,
        providerUserId: attendee.attendeeId,
        identifier: attendee.identifier,
        displayName: attendee.displayName,
        pictureUrl: attendee.pictureUrl,
        profileUrl: attendee.profileUrl ?? null,
        headline: attendee.headline ?? null,
        occupation: attendee.occupation ?? null,
        isSelf: attendee.isSelf,
      };
      const existingParticipants = await prisma.messagingThreadParticipant.findMany({
        where: {
          companyId: context.companyId,
          messagingThreadId: seededThread.id,
          OR: [{ providerUserId: attendee.attendeeId }, { identifier: attendee.identifier }],
        },
        select: { id: true },
      });
      if (existingParticipants.length > 1) {
        throw new Error(
          `Conflicting demo participants for ${attendee.displayName} in ${fixture.name ?? fixture.subject ?? fixture.account}`,
        );
      }

      const existingParticipant = existingParticipants[0];
      if (existingParticipant) {
        await prisma.messagingThreadParticipant.update({
          where: { id: existingParticipant.id },
          data: participantData,
        });
      } else {
        await prisma.messagingThreadParticipant.upsert({
          where: {
            messagingThreadId_providerUserId: {
              messagingThreadId: seededThread.id,
              providerUserId: attendee.attendeeId,
            },
          },
          update: participantData,
          create: {
            id: participantId,
            ...participantData,
          },
        });
      }
    }

    for (const [localMessageIndex, message] of fixture.messages.entries()) {
      messageIndex += 1;
      const messageId = fixtureId("19000000", messageIndex);
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
        messagingThreadId: seededThread.id,
        provider,
        providerMessageId: isEmailFixtureProvider(provider) ? `demo-provider-message-${messageIndex}` : null,
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
        bodyHtml: isEmailFixtureProvider(provider) ? emailHtml(message.text) : null,
        attachmentsMeta: inputJson([]),
        folderIds: emailFolderIds(provider, message.sender === "self"),
        isEvent: false,
        isDeleted: false,
        isHidden: false,
        isDraft: false,
        sentAt,
        editedAt: null,
        unipileMessageId,
        createdAt: sentAt,
      };

      await prisma.messagingMessage.upsert({
        where: {
          connectedAccountId_unipileMessageId: {
            connectedAccountId,
            unipileMessageId,
          },
        },
        update: data,
        create: {
          ...data,
          id: messageId,
        },
      });
    }
  }
  await prisma.connectedAccount.deleteMany({
    where: {
      companyId: context.companyId,
      id: { startsWith: "16000000-", notIn: desiredAccountIds },
    },
  });
}
