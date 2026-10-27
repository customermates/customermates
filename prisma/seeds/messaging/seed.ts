import type { MessagingProvider, Prisma, PrismaClient } from "@/generated/prisma";

import type { EmailSettings } from "@/ee/messaging/email-settings";

import {
  DEFAULT_LINK_HEX,
  EmailFontFamily,
  EmailLinkStyle,
  SignatureTemplate,
  defaultEmailSettings,
} from "@/ee/messaging/email-settings";
import { identityLookupValue } from "@/ee/messaging/identity-lookup";
import { composeEmailBodies } from "@/ee/messaging/outbound/email-signature";
import { renderEmailMarkdown } from "@/ee/messaging/outbound/render-signature";

import { workspaceFixtureId } from "../helpers";
import { SYNTHETIC_SEED_TIMELINE } from "../timeline";
import type { MessagingFixtureProvider, ThreadFixture, WorkspaceMessagingFixtures } from "./fixtures";

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

/** Minutes between the messages of a conversation: recent ones span a day or two, older ones about a week. */
export function messageGapMinutes(fixture: Pick<ThreadFixture, "latestMinutesAgo">): number {
  return fixture.latestMinutesAgo < 2 * 24 * 60 ? 7 * 60 : 26 * 60;
}

const EMAIL_FOLDER_IDS = {
  google: { inbox: "demo-google-inbox", sent: "demo-google-sent" },
  outlook: { inbox: "demo-outlook-inbox", sent: "demo-outlook-sent" },
} as const;

type EmailFixtureProvider = keyof typeof EMAIL_FOLDER_IDS;

function isEmailFixtureProvider(provider: MessagingProvider): provider is EmailFixtureProvider {
  return provider === "google" || provider === "outlook";
}

const ACCOUNT_LABELS: Record<MessagingFixtureProvider, string> = {
  google: "Gmail",
  outlook: "Outlook",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  telegram: "Telegram",
};

const ACCOUNT_ORDER: readonly MessagingFixtureProvider[] = [
  "google",
  "linkedin",
  "whatsapp",
  "instagram",
  "telegram",
  "outlook",
];

const MARKDOWN_LINE_BREAK = "\\\n";

/** The fixture account id of a provider: one fixed slot per provider inside the workspace's id namespace. */
export function messagingAccountId(tag: string, provider: MessagingFixtureProvider): string {
  return workspaceFixtureId("16000000", tag, ACCOUNT_ORDER.indexOf(provider) + 1);
}

/** Provider account ids are unique across workspaces; the team workspace keeps the historical names. */
export function messagingUnipileAccountId(tag: string, provider: MessagingFixtureProvider): string {
  return tag === "0000" ? `demo-fixture-${provider}-account` : `demo-fixture-${tag}-${provider}-account`;
}

function workspaceSignature(fixtures: WorkspaceMessagingFixtures): string {
  return [
    `**${fixtures.self.name}**`,
    `${fixtures.self.title}, ${fixtures.self.companyName}`,
    `[${fixtures.seedUserEmail}](mailto:${fixtures.seedUserEmail})`,
    `<${fixtures.self.website}>`,
  ].join(MARKDOWN_LINE_BREAK);
}

function workspaceEmailSettings(): EmailSettings {
  const base = defaultEmailSettings();
  return {
    ...base,
    appearance: {
      ...base.appearance,
      fontFamily: EmailFontFamily.sansSerif,
      fontSize: 14,
      linkHex: DEFAULT_LINK_HEX,
      linkStyle: EmailLinkStyle.underlined,
    },
    signature: { ...base.signature, enabled: true, template: SignatureTemplate.plain },
  };
}

function correspondentEmailSettings(): EmailSettings {
  const base = defaultEmailSettings();
  return {
    ...base,
    appearance: {
      ...base.appearance,
      fontFamily: EmailFontFamily.serif,
      fontSize: 14,
      linkHex: "#2f6fd0",
      linkStyle: EmailLinkStyle.plain,
    },
    signature: { ...base.signature, enabled: true, template: SignatureTemplate.plain },
  };
}

function inputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * Seeds the conversations of one demo workspace: its connected accounts, a calendar, LinkedIn activity, and every
 * thread with participants, messages and explicit record links. Fixture rows live in the workspace's id namespace;
 * rows the UI may have recreated are reconciled by their natural keys, so a repeated seed changes nothing.
 */
export async function seedWorkspaceMessaging(
  prisma: PrismaClient,
  fixtures: WorkspaceMessagingFixtures,
): Promise<void> {
  const { companyId, tag } = fixtures;
  const id = (group: string, index: number) => workspaceFixtureId(group, tag, index);
  const person = (key: string) => {
    const found = fixtures.people[key];
    if (!found) throw new Error(`Missing demo messaging person ${key}`);
    return found;
  };

  const personAttendee = (key: string, provider: MessagingFixtureProvider): DemoAttendee => {
    const entry = person(key);
    const identifier = isEmailFixtureProvider(provider)
      ? entry.email
      : provider === "linkedin"
        ? entry.linkedin
        : provider === "whatsapp"
          ? entry.phone
          : provider === "instagram"
            ? entry.instagram
            : entry.telegram;
    const profileUrl =
      provider === "linkedin"
        ? entry.profileUrl
        : provider === "instagram"
          ? entry.instagramProfileUrl
          : provider === "telegram"
            ? entry.telegramProfileUrl
            : undefined;
    if (!identifier) throw new Error(`Missing ${provider} demo identifier for ${key}`);
    return {
      attendeeId: `demo-${provider}-${key}`,
      displayName: entry.displayName,
      identifier,
      isSelf: false,
      headline: entry.headline,
      occupation: entry.occupation,
      pictureUrl: entry.avatarPath ?? "",
      profileUrl,
    };
  };

  const selfIdentities: Record<MessagingFixtureProvider, { identifier: string; profileUrl?: string }> = {
    google: { identifier: fixtures.seedUserEmail },
    outlook: { identifier: fixtures.seedUserEmail },
    instagram: { identifier: "max.bergmann", profileUrl: "https://instagram.example/max-bergmann" },
    linkedin: { identifier: "max-bergmann.linkedin.example", profileUrl: "https://linkedin.example/in/max-bergmann" },
    telegram: { identifier: "max_bergmann", profileUrl: "https://telegram.example/max-bergmann" },
    whatsapp: { identifier: "+12025550199" },
  };
  const selfAttendee = (provider: MessagingFixtureProvider): DemoAttendee => ({
    attendeeId: `demo-${provider}-self`,
    displayName: fixtures.self.name,
    identifier: selfIdentities[provider].identifier,
    isSelf: true,
    occupation: `${fixtures.self.title} at ${fixtures.self.companyName}`,
    pictureUrl: fixtures.self.avatarPath,
    profileUrl: selfIdentities[provider].profileUrl,
  });

  const correspondentSignature = (key: string): string | null => {
    const entry = person(key);
    if (!entry.email) return null;
    const role = entry.occupation ?? entry.headline;
    return [`**${entry.displayName}**`, ...(role ? [role] : []), `[${entry.email}](mailto:${entry.email})`].join(
      MARKDOWN_LINE_BREAK,
    );
  };
  const emailBodies = (text: string, sender: string) =>
    sender === "self"
      ? composeEmailBodies(text, workspaceSignature(fixtures), workspaceEmailSettings(), "markdown")
      : composeEmailBodies(text, correspondentSignature(sender), correspondentEmailSettings(), "markdown");
  const draftBodies = (text: string) => ({
    plainText: text,
    html: renderEmailMarkdown(text, workspaceEmailSettings().appearance).html,
  });

  for (const thread of fixtures.threads) {
    if (!fixtures.accounts.includes(thread.account))
      throw new Error(`A ${thread.account} conversation needs a ${thread.account} account`);
  }

  const unipileAccountIds = fixtures.accounts.map((provider) => messagingUnipileAccountId(tag, provider));
  const persistedAnchor = await prisma.connectedAccount.findFirst({
    where: { companyId, unipileAccountId: { in: unipileAccountIds }, lastSyncedAt: { not: null } },
    orderBy: { id: "asc" },
    select: { lastSyncedAt: true },
  });
  const anchorWindow = 5 * MINUTE;
  const anchor = persistedAnchor?.lastSyncedAt
    ? new Date(persistedAnchor.lastSyncedAt.getTime() + 5 * MINUTE)
    : new Date(Math.floor(Date.now() / anchorWindow) * anchorWindow);

  const folderCounts = (provider: EmailFixtureProvider) => {
    const threads = fixtures.threads.filter((thread) => thread.account === provider);
    const inbound = threads.reduce(
      (count, thread) => count + thread.messages.filter((m) => m.sender !== "self").length,
      0,
    );
    const sent = threads.reduce(
      (count, thread) => count + thread.messages.filter((m) => m.sender === "self").length,
      0,
    );
    return [
      {
        id: EMAIL_FOLDER_IDS[provider].inbox,
        name: "Inbox",
        role: "INBOX",
        totalCount: inbound,
        unreadCount: threads.filter((thread) => thread.state === "unread").length,
      },
      { id: EMAIL_FOLDER_IDS[provider].sent, name: "Sent", role: "SENT", totalCount: sent, unreadCount: 0 },
    ];
  };

  const seededAccountIds = new Map<MessagingFixtureProvider, string>();
  for (const provider of ACCOUNT_ORDER.filter((candidate) => fixtures.accounts.includes(candidate))) {
    const email = isEmailFixtureProvider(provider);
    const accountTimeline = SYNTHETIC_SEED_TIMELINE.connectedAccount(ACCOUNT_ORDER.indexOf(provider));
    const data = {
      companyId,
      userId: fixtures.userId,
      provider,
      status: "ok" as const,
      hasMessaging: true,
      hasCalendar: email,
      emailAddress: email ? fixtures.seedUserEmail : null,
      displayName: `${fixtures.self.name} · ${ACCOUNT_LABELS[provider]}`,
      sentFolderIds: email ? [EMAIL_FOLDER_IDS[provider].sent] : [],
      folders: inputJson(email ? folderCounts(provider) : []),
      selectedFolderIds: email ? [EMAIL_FOLDER_IDS[provider].inbox, EMAIL_FOLDER_IDS[provider].sent] : [],
      foldersSyncedAt: email ? new Date(anchor.getTime() - 5 * MINUTE) : null,
      ...(email
        ? { signature: workspaceSignature(fixtures), signatureFields: inputJson(workspaceEmailSettings()) }
        : {}),
      linkedinProducts: provider === "linkedin" ? ["classic"] : [],
      shared: false,
      syncing: false,
      ownerAvatarUrl: fixtures.self.avatarPath,
      lastSyncedAt: new Date(anchor.getTime() - 5 * MINUTE),
    };
    const unipileAccountId = messagingUnipileAccountId(tag, provider);
    const account = await prisma.connectedAccount.upsert({
      where: { unipileAccountId },
      update: { ...data, ...accountTimeline },
      create: { ...data, id: messagingAccountId(tag, provider), unipileAccountId, ...accountTimeline },
    });
    seededAccountIds.set(provider, account.id);
  }
  const accountOf = (provider: MessagingFixtureProvider) => {
    const accountId = seededAccountIds.get(provider);
    if (!accountId) throw new Error(`Missing demo ${provider} account`);
    return accountId;
  };

  await prisma.accountActivity.deleteMany({ where: { companyId, id: { startsWith: `26000000-${tag}-` } } });
  await prisma.calendarEvent.deleteMany({ where: { companyId, id: { startsWith: `25000000-${tag}-` } } });
  await prisma.calendar.deleteMany({
    where: { companyId, events: { none: {} }, id: { startsWith: `24000000-${tag}-` } },
  });

  const calendarAccount = seededAccountIds.get("google") ?? seededAccountIds.get("outlook");
  if (fixtures.calendar && calendarAccount) {
    const unipileCalendarId = "demo-fixture-google-calendar";
    const calendarData = {
      companyId,
      connectedAccountId: calendarAccount,
      name: fixtures.calendar.name,
      description: null,
      color: null,
      timezone: fixtures.calendar.timezone,
    };
    const calendar = await prisma.calendar.upsert({
      where: { connectedAccountId_unipileCalendarId: { connectedAccountId: calendarAccount, unipileCalendarId } },
      update: calendarData,
      create: { ...calendarData, id: id("24000000", 1), unipileCalendarId },
    });
    const organizer = {
      email: fixtures.seedUserEmail.toLowerCase(),
      displayName: fixtures.self.name,
      responseStatus: "yes",
      isOrganizer: true,
    };
    for (const [index, event] of fixtures.calendar.events.entries()) {
      const attendees = event.attendees.map(({ person: key, responseStatus }) => ({
        email: person(key).email?.toLowerCase() ?? "",
        displayName: person(key).displayName,
        responseStatus,
        isOrganizer: false,
      }));
      if (attendees.some(({ email }) => !email)) throw new Error("Missing demo calendar attendee email");
      const startsAt = new Date(anchor.getTime() - event.startsMinutesAgo * MINUTE);
      const unipileEventId = `demo-fixture-calendar-event-${index + 1}`;
      const eventData = {
        companyId,
        connectedAccountId: calendarAccount,
        calendarId: calendar.id,
        title: event.title,
        description: null,
        location: null,
        conferenceUrl: null,
        startsAt,
        endsAt: new Date(startsAt.getTime() + event.durationMinutes * MINUTE),
        allDay: false,
        timezone: fixtures.calendar.timezone,
        recurrenceRule: null,
        status: "confirmed" as const,
        visibility: null,
        attendees: inputJson(attendees),
        organizer: inputJson(organizer),
        attendeeEmails: [...new Set([...attendees.map(({ email }) => email), organizer.email])],
      };
      await prisma.calendarEvent.upsert({
        where: { connectedAccountId_unipileEventId: { connectedAccountId: calendarAccount, unipileEventId } },
        update: eventData,
        create: { ...eventData, id: id("25000000", index + 1), unipileEventId },
      });
    }
  }

  const linkedinAccount = seededAccountIds.get("linkedin");
  for (const [index, activity] of (linkedinAccount ? fixtures.linkedinActivities : []).entries()) {
    const entry = person(activity.person);
    const identifier = `demo-linkedin-${activity.person}`;
    const activityData = {
      companyId,
      connectedAccountId: accountOf("linkedin"),
      payload: inputJson({
        fullName: entry.displayName,
        headline: entry.headline,
        profileUrl: entry.profileUrl,
        pictureUrl: entry.avatarPath ?? null,
      }),
      occurredAt: new Date(anchor.getTime() - activity.occurredMinutesAgo * MINUTE),
    };
    await prisma.accountActivity.upsert({
      where: {
        connectedAccountId_kind_identifier: {
          connectedAccountId: accountOf("linkedin"),
          kind: "linkedin_connection_accepted",
          identifier,
        },
      },
      update: activityData,
      create: { ...activityData, id: id("26000000", index + 1), identifier, kind: "linkedin_connection_accepted" },
    });
  }

  // Positional fixture ids can point at different natural keys after fixtures are inserted or reordered. Rebuild
  // only rows in the reserved namespaces before reconciling natural-key rows the UI may have recreated.
  await prisma.messagingMessage.deleteMany({ where: { companyId, id: { startsWith: `19000000-${tag}-` } } });
  await prisma.messagingThreadParticipant.deleteMany({ where: { companyId, id: { startsWith: `18000000-${tag}-` } } });
  await prisma.messagingThread.deleteMany({
    where: { companyId, id: { startsWith: `17000000-${tag}-` }, messages: { none: {} }, participants: { none: {} } },
  });

  let participantIndex = 0;
  let messageIndex = 0;
  const seededThreadIds: string[] = [];
  for (const [threadIndex, fixture] of fixtures.threads.entries()) {
    const provider = fixture.account;
    const connectedAccountId = accountOf(provider);
    const threadId = id("17000000", threadIndex + 1);
    const self = selfAttendee(provider);
    const attendees = [self, ...fixture.participants.map((key) => personAttendee(key, provider))];
    const latestAt = new Date(anchor.getTime() - fixture.latestMinutesAgo * MINUTE);
    const lastMessage = fixture.messages.at(-1);
    if (!lastMessage) throw new Error("Every demo thread must contain a message");
    const unipileThreadId = `demo-fixture-thread-${threadIndex + 1}`;
    const threadData = {
      companyId,
      connectedAccountId,
      state: fixture.state,
      type: fixture.type,
      name: fixture.name,
      unipileThreadId,
      unipileThreadAltId: null,
      provider,
      subject: fixture.subject,
      lastMessageAt: latestAt,
      lastMessagePreview: lastMessage.text,
      lastMessageIsSender: lastMessage.sender === "self",
      sharedToCrm: true,
      createdAt: new Date(latestAt.getTime() - (fixture.messages.length - 1) * messageGapMinutes(fixture) * MINUTE),
    };
    const occupied = await prisma.messagingThread.findUnique({ where: { id: threadId }, select: { id: true } });
    const thread = await prisma.messagingThread.upsert({
      where: { connectedAccountId_unipileThreadId: { connectedAccountId, unipileThreadId } },
      update: threadData,
      create: { ...(occupied ? {} : { id: threadId }), ...threadData },
    });
    seededThreadIds.push(thread.id);

    for (const attendee of attendees) {
      participantIndex += 1;
      const participantData = {
        companyId,
        messagingThreadId: thread.id,
        provider,
        providerUserId: attendee.attendeeId,
        identifier: attendee.identifier,
        identityLookupValue: identityLookupValue(provider, attendee.identifier),
        displayName: attendee.displayName,
        pictureUrl: attendee.pictureUrl,
        profileUrl: attendee.profileUrl ?? null,
        headline: attendee.headline ?? null,
        occupation: attendee.occupation ?? null,
        isSelf: attendee.isSelf,
      };
      const existing = await prisma.messagingThreadParticipant.findMany({
        where: {
          companyId,
          messagingThreadId: thread.id,
          OR: [{ providerUserId: attendee.attendeeId }, { identifier: attendee.identifier }],
        },
        select: { id: true },
      });
      if (existing.length > 1) {
        throw new Error(
          `Conflicting demo participants for ${attendee.displayName} in ${fixture.name ?? fixture.subject ?? provider}`,
        );
      }
      if (existing[0])
        await prisma.messagingThreadParticipant.update({ where: { id: existing[0].id }, data: participantData });
      else {
        await prisma.messagingThreadParticipant.upsert({
          where: {
            messagingThreadId_providerUserId: { messagingThreadId: thread.id, providerUserId: attendee.attendeeId },
          },
          update: participantData,
          create: { id: id("18000000", participantIndex), ...participantData },
        });
      }
    }

    const sentMessageCount = fixture.messages.filter((entry) => entry.draft !== true).length;
    let sentSoFar = 0;
    for (const message of fixture.messages) {
      messageIndex += 1;
      const sender = message.sender === "self" ? self : personAttendee(message.sender, provider);
      const recipients = attendees.filter((attendee) => attendee.attendeeId !== sender.attendeeId);
      const sentPosition = message.draft === true ? sentMessageCount - 1 : sentSoFar;
      if (message.draft !== true) sentSoFar += 1;
      const sentAt = new Date(
        latestAt.getTime() - (sentMessageCount - 1 - sentPosition) * messageGapMinutes(fixture) * MINUTE,
      );
      const reactionSender = message.reaction
        ? message.reaction.sender === "self"
          ? self
          : personAttendee(message.reaction.sender, provider)
        : null;
      const unipileMessageId = `demo-fixture-message-${messageIndex}`;
      const bodies = isEmailFixtureProvider(provider)
        ? message.html
          ? { plainText: message.text, html: message.html }
          : message.draft === true
            ? draftBodies(message.text)
            : emailBodies(message.text, message.sender)
        : null;
      const data = {
        companyId,
        connectedAccountId,
        messagingThreadId: thread.id,
        provider,
        providerMessageId: isEmailFixtureProvider(provider) ? `demo-provider-message-${tag}-${messageIndex}` : null,
        direction: message.sender === "self" ? ("outbound" as const) : ("inbound" as const),
        origin: "external" as const,
        sender: inputJson(sender),
        senderIdentifier: sender.identifier,
        recipients: inputJson({ to: recipients, cc: [], bcc: [] }),
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
        bodyText: bodies ? bodies.plainText : message.text,
        bodyHtml: bodies ? bodies.html : null,
        attachmentsMeta: inputJson([]),
        folderIds: isEmailFixtureProvider(provider)
          ? [message.sender === "self" ? EMAIL_FOLDER_IDS[provider].sent : EMAIL_FOLDER_IDS[provider].inbox]
          : [],
        isEvent: false,
        isDeleted: false,
        isHidden: false,
        isDraft: message.draft === true,
        sentAt,
        editedAt: null,
        unipileMessageId,
        createdAt: sentAt,
      };
      await prisma.messagingMessage.upsert({
        where: { connectedAccountId_unipileMessageId: { connectedAccountId, unipileMessageId } },
        update: data,
        create: { ...data, id: id("19000000", messageIndex) },
      });
    }

    await prisma.messagingThreadRecordLink.deleteMany({ where: { companyId, threadId: thread.id } });
    if (fixture.links.length) {
      await prisma.messagingThreadRecordLink.createMany({
        data: fixture.links.map((link) => ({ companyId, threadId: thread.id, ...link })),
        skipDuplicates: true,
      });
    }
  }

  await prisma.messagingThread.deleteMany({
    where: {
      companyId,
      connectedAccountId: { in: [...seededAccountIds.values()] },
      unipileThreadId: { startsWith: "demo-fixture-thread-" },
      id: { notIn: seededThreadIds },
    },
  });
  await prisma.connectedAccount.deleteMany({
    where: { companyId, id: { startsWith: `16000000-${tag}-`, notIn: [...seededAccountIds.values()] } },
  });
}
