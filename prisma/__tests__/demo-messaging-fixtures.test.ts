import type { PrismaClient } from "@/generated/prisma";

import { afterEach, describe, expect, it, vi } from "vitest";

import { SYNTHETIC_COMPANY_USERS } from "@/core/config/synthetic-seed-user";

import { seedDemoMessagingFixtures } from "../seeds/messaging/seed";
import { people, threads as threadFixtures } from "../seeds/messaging/fixtures";
import { SYNTHETIC_CONTACT_EMAIL_ADDRESSES, SYNTHETIC_CONTACT_NAMES } from "../seeds/contacts";
import { fixtureId } from "../seeds/helpers";
import { SYNTHETIC_SEED_TIMELINE } from "../seeds/timeline";

type FixtureRow = Record<string, unknown>;
type UpsertInput = {
  create: FixtureRow;
  update: FixtureRow;
  where: FixtureRow;
};

type UpdateInput = {
  data: FixtureRow;
  where: FixtureRow;
};

type DeleteManyInput = {
  where: FixtureRow;
};

function recordingDelegate() {
  const calls: UpsertInput[] = [];
  const deleteManyCalls: DeleteManyInput[] = [];
  const updateCalls: UpdateInput[] = [];
  const upsertResultIds: string[] = [];

  return {
    calls,
    deleteManyCalls,
    updateCalls,
    upsertResultIds,
    delegate: {
      deleteMany: vi.fn((input: DeleteManyInput) => {
        deleteManyCalls.push(input);
        return Promise.resolve({ count: 0 });
      }),
      findFirst: vi.fn((_input?: FixtureRow) => Promise.resolve(null as FixtureRow | null)),
      findMany: vi.fn((_input?: FixtureRow) => Promise.resolve([] as FixtureRow[])),
      findUnique: vi.fn((_input?: FixtureRow) => Promise.resolve(null as FixtureRow | null)),
      update: vi.fn((input: UpdateInput) => {
        updateCalls.push(input);
        return Promise.resolve({ id: input.where.id, ...input.data });
      }),
      updateMany: vi.fn(() => Promise.resolve({ count: 0 })),
      upsert: vi.fn((input: UpsertInput) => {
        calls.push(input);
        const id = upsertResultIds.shift();
        return Promise.resolve(id ? { ...input.create, id } : input.create);
      }),
    },
  };
}

function recordingPrisma() {
  const accountActivities = recordingDelegate();
  const calendarEvents = recordingDelegate();
  const calendars = recordingDelegate();
  const connectedAccounts = recordingDelegate();
  const contactIdentifiers = recordingDelegate();
  const messages = recordingDelegate();
  const participants = recordingDelegate();
  const threads = recordingDelegate();
  connectedAccounts.delegate.findFirst.mockImplementation(() => {
    const googleAccount = connectedAccounts.calls.find(
      ({ create }) => create.unipileAccountId === "demo-fixture-google-account",
    );
    return Promise.resolve(googleAccount ? { lastSyncedAt: googleAccount.create.lastSyncedAt } : null);
  });

  return {
    prisma: {
      accountActivity: accountActivities.delegate,
      calendar: calendars.delegate,
      calendarEvent: calendarEvents.delegate,
      connectedAccount: connectedAccounts.delegate,
      contactIdentifier: contactIdentifiers.delegate,
      messagingMessage: messages.delegate,
      messagingThread: threads.delegate,
      messagingThreadParticipant: participants.delegate,
    } as unknown as PrismaClient,
    delegates: {
      connectedAccounts: connectedAccounts.delegate,
      contactIdentifiers: contactIdentifiers.delegate,
      participants: participants.delegate,
    },
    upsertResultIds: {
      calendars: calendars.upsertResultIds,
      connectedAccounts: connectedAccounts.upsertResultIds,
      messages: messages.upsertResultIds,
      participants: participants.upsertResultIds,
      threads: threads.upsertResultIds,
    },
    records: {
      accountActivities: accountActivities.calls,
      accountActivityDeletes: accountActivities.deleteManyCalls,
      calendarEvents: calendarEvents.calls,
      calendarEventDeletes: calendarEvents.deleteManyCalls,
      calendars: calendars.calls,
      calendarDeletes: calendars.deleteManyCalls,
      connectedAccounts: connectedAccounts.calls,
      connectedAccountDeletes: connectedAccounts.deleteManyCalls,
      contactIdentifiers: contactIdentifiers.calls,
      contactIdentifierDeletes: contactIdentifiers.deleteManyCalls,
      contactIdentifierUpdates: contactIdentifiers.updateCalls,
      messages: messages.calls,
      messageDeletes: messages.deleteManyCalls,
      participants: participants.calls,
      participantDeletes: participants.deleteManyCalls,
      threads: threads.calls,
      threadDeletes: threads.deleteManyCalls,
    },
  };
}

function createdRows(calls: UpsertInput[]): FixtureRow[] {
  return calls.map((call) => call.create);
}

function expectCanonicalUpdates(calls: UpsertInput[], createOnlyKeys = ["id"]): void {
  for (const { create, update } of calls)
    expect(update).toEqual(Object.fromEntries(Object.entries(create).filter(([key]) => !createOnlyKeys.includes(key))));
}

function stringsByCount(rows: FixtureRow[], property: string): Record<string, number> {
  return rows.reduce<Record<string, number>>((counts, row) => {
    const value = String(row[property]);
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

const context = {
  companyId: "10000000-0000-4000-8000-000000000001",
  contactIds: Array.from({ length: 30 }, (_, index) => `contact-${index}`),
  seedUserEmail: SYNTHETIC_COMPANY_USERS.maxBergmann.email,
  userId: "30000000-0000-4000-8000-000000000001",
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe.each(["demo", "cloud"] as const)("synthetic messaging fixtures in APP_MODE=%s", (appMode) => {
  it("creates the complete connected-account and inbox graph", async () => {
    vi.stubEnv("APP_MODE", appMode);
    const { prisma, records } = recordingPrisma();

    await seedDemoMessagingFixtures(prisma, context);

    const accounts = createdRows(records.connectedAccounts);
    const accountActivities = createdRows(records.accountActivities);
    const calendarEvents = createdRows(records.calendarEvents);
    const calendars = createdRows(records.calendars);
    const identifiers = createdRows(records.contactIdentifiers);
    const messages = createdRows(records.messages);
    const participants = createdRows(records.participants);
    const threads = createdRows(records.threads);

    expect(accounts).toHaveLength(3);
    expect(accountActivities).toHaveLength(1);
    expect(calendarEvents).toHaveLength(1);
    expect(calendars).toHaveLength(1);
    expect(stringsByCount(accounts, "provider")).toEqual({
      google: 1,
      linkedin: 1,
      whatsapp: 1,
    });
    expect(accounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          displayName: "Max Bergmann · Gmail",
          emailAddress: context.seedUserEmail,
          hasCalendar: true,
          hasMessaging: true,
          provider: "google",
        }),
        expect.objectContaining({
          displayName: "Max Bergmann · LinkedIn",
          hasCalendar: false,
          hasMessaging: true,
          linkedinProducts: ["classic"],
          provider: "linkedin",
        }),
        expect.objectContaining({
          displayName: "Max Bergmann · WhatsApp",
          hasCalendar: false,
          hasMessaging: true,
          provider: "whatsapp",
        }),
      ]),
    );
    expectCanonicalUpdates(records.connectedAccounts, ["id", "unipileAccountId"]);
    for (const call of records.connectedAccounts)
      expect(call.where).toEqual({ unipileAccountId: call.create.unipileAccountId });
    for (const call of records.contactIdentifiers) {
      expect(call.where).toEqual({
        companyId_channelClass_value: {
          companyId: call.create.companyId,
          channelClass: call.create.channelClass,
          value: call.create.value,
        },
      });
    }
    expectCanonicalUpdates(records.contactIdentifiers);
    for (const account of accounts) {
      expect(account).toMatchObject({
        companyId: context.companyId,
        ownerAvatarUrl: "https://customermates.com/demo/avatars/photos/max-bergmann.png",
        shared: false,
        status: "ok",
        syncing: false,
        userId: context.userId,
      });
      expect(String(account.unipileAccountId)).toMatch(/^demo-fixture-/);
    }

    expect(calendars[0]).toMatchObject({
      companyId: context.companyId,
      connectedAccountId: accounts[0]?.id,
      name: "Customer meetings",
      timezone: "Europe/Berlin",
      unipileCalendarId: "demo-fixture-google-calendar",
    });
    expect(records.calendars[0]?.where).toEqual({
      connectedAccountId_unipileCalendarId: {
        connectedAccountId: accounts[0]?.id,
        unipileCalendarId: "demo-fixture-google-calendar",
      },
    });
    expectCanonicalUpdates(records.calendars, ["id", "unipileCalendarId"]);

    expect(calendarEvents[0]).toMatchObject({
      allDay: false,
      attendeeEmails: ["anna.mueller@roche.example", "amin.hassan@tui.example", context.seedUserEmail.toLowerCase()],
      calendarId: calendars[0]?.id,
      companyId: context.companyId,
      conferenceUrl: null,
      connectedAccountId: accounts[0]?.id,
      status: "confirmed",
      title: "Customer operations planning",
      unipileEventId: "demo-fixture-calendar-event-1",
    });
    expect((calendarEvents[0]?.endsAt as Date).getTime() - (calendarEvents[0]?.startsAt as Date).getTime()).toBe(
      45 * 60_000,
    );
    expect(calendarEvents[0]?.attendees).toEqual([
      expect.objectContaining({
        displayName: "Anna Müller",
        responseStatus: "yes",
      }),
      expect.objectContaining({
        displayName: "Amin Hassan",
        responseStatus: "maybe",
      }),
    ]);
    expect(calendarEvents[0]?.organizer).toEqual(
      expect.objectContaining({
        displayName: "Max Bergmann",
        isOrganizer: true,
      }),
    );
    expect(records.calendarEvents[0]?.where).toEqual({
      connectedAccountId_unipileEventId: {
        connectedAccountId: accounts[0]?.id,
        unipileEventId: "demo-fixture-calendar-event-1",
      },
    });
    expectCanonicalUpdates(records.calendarEvents, ["id", "unipileEventId"]);

    expect(accountActivities[0]).toMatchObject({
      companyId: context.companyId,
      connectedAccountId: accounts[1]?.id,
      identifier: "demo-linkedin-leon",
      kind: "linkedin_connection_accepted",
      payload: expect.objectContaining({ fullName: "Leon Becker" }),
    });
    expect(records.accountActivities[0]?.where).toEqual({
      connectedAccountId_kind_identifier: {
        connectedAccountId: accounts[1]?.id,
        identifier: "demo-linkedin-leon",
        kind: "linkedin_connection_accepted",
      },
    });
    expectCanonicalUpdates(records.accountActivities, ["id", "identifier", "kind"]);

    expect(identifiers).toHaveLength(4);
    expect(identifiers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channelClass: "linkedin",
          contactId: "contact-0",
          displayName: "Leon Becker",
          provider: "linkedin",
        }),
        expect.objectContaining({
          channelClass: "linkedin",
          contactId: "contact-26",
          displayName: "Rashid Malik",
          provider: "linkedin",
        }),
        expect.objectContaining({
          channelClass: "phone",
          contactId: "contact-19",
          displayName: "Sophie Wagner",
          provider: "whatsapp",
        }),
        expect.objectContaining({
          channelClass: "phone",
          contactId: "contact-6",
          displayName: "Jonas Weber",
          provider: "whatsapp",
        }),
      ]),
    );

    expect(threads).toHaveLength(25);
    expectCanonicalUpdates(records.threads);
    for (const call of records.threads) {
      expect(call.where).toEqual({
        connectedAccountId_unipileThreadId: {
          connectedAccountId: call.create.connectedAccountId,
          unipileThreadId: call.create.unipileThreadId,
        },
      });
    }
    expect(stringsByCount(threads, "provider")).toEqual({
      google: 10,
      linkedin: 8,
      whatsapp: 7,
    });
    expect(stringsByCount(threads, "state")).toEqual({
      open: 15,
      unread: 10,
    });
    expect(stringsByCount(threads, "type")).toEqual({ group: 6, single: 19 });
    expect(
      threads.map(({ name, provider, subject }) => ({
        name,
        provider,
        subject,
      })),
    ).toEqual(
      expect.arrayContaining([
        {
          name: null,
          provider: "google",
          subject: "Next steps for the Roche rollout",
        },
        {
          name: "Customer operations working group",
          provider: "google",
          subject: "Customer operations roundtable",
        },
        {
          name: null,
          provider: "google",
          subject: "ASML retainer: contract review",
        },
        { name: "Leon Becker", provider: "linkedin", subject: null },
        { name: "Rashid Malik", provider: "linkedin", subject: null },
        { name: "Sophie Wagner", provider: "whatsapp", subject: null },
        {
          name: "Mobility rollout working group",
          provider: "whatsapp",
          subject: null,
        },
        {
          name: "Pilot steering group",
          provider: "google",
          subject: "Weekly pilot steering update",
        },
        {
          name: "Transformation leaders circle",
          provider: "linkedin",
          subject: null,
        },
        {
          name: "Launch readiness team",
          provider: "whatsapp",
          subject: null,
        },
      ]),
    );
    expect(threads.every((thread) => thread.companyId === context.companyId && thread.sharedToCrm === true)).toBe(true);

    expect(participants).toHaveLength(59);
    const participantsByThread = Map.groupBy(participants, (participant) => String(participant.messagingThreadId));
    for (const thread of threads) {
      const threadParticipants = participantsByThread.get(String(thread.id)) ?? [];
      expect(threadParticipants.filter((participant) => participant.isSelf)).toHaveLength(1);
      expect(threadParticipants.some((participant) => !participant.isSelf)).toBe(true);
      expect(threadParticipants.find((participant) => participant.isSelf)?.displayName).toBe("Max Bergmann");
    }
    expect(
      new Set(participants.filter((participant) => !participant.isSelf).map(({ displayName }) => displayName)),
    ).toEqual(
      new Set([
        "Leon Becker",
        "Amin Hassan",
        "Anna Müller",
        "Clara Neumann",
        "Marco Silva",
        "Rashid Malik",
        "Sophie Wagner",
        "Jonas Weber",
        "Yasmin Farouk",
      ]),
    );
    const counterpartNamesByProvider = Object.fromEntries(
      ["google", "linkedin", "whatsapp"].map((provider) => [
        provider,
        [
          ...new Set(
            participants
              .filter((participant) => participant.provider === provider && !participant.isSelf)
              .map(({ displayName }) => displayName),
          ),
        ].sort(),
      ]),
    );
    expect(counterpartNamesByProvider).toEqual({
      google: ["Amin Hassan", "Anna Müller", "Clara Neumann", "Yasmin Farouk"],
      linkedin: ["Leon Becker", "Rashid Malik"],
      whatsapp: ["Jonas Weber", "Marco Silva", "Sophie Wagner"],
    });

    const deliberatelyUnlinked = participants.filter(({ displayName }) =>
      ["Clara Neumann", "Marco Silva"].includes(String(displayName)),
    );
    expect(deliberatelyUnlinked).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          displayName: "Clara Neumann",
          identifier: "clara.neumann@partner.demo.example",
          isSelf: false,
          provider: "google",
        }),
        expect.objectContaining({
          displayName: "Marco Silva",
          identifier: "+12025550127",
          isSelf: false,
          provider: "whatsapp",
        }),
      ]),
    );
    expect(deliberatelyUnlinked).toHaveLength(4);
    const fixtureIdentifierValues = new Set(identifiers.map(({ value }) => String(value)));
    expect(fixtureIdentifierValues).not.toContain("clara.neumann@partner.demo.example");
    expect(fixtureIdentifierValues).not.toContain("+12025550127");
    expect(
      messages.filter(({ sender }) =>
        ["Clara Neumann", "Marco Silva"].includes(String((sender as FixtureRow).displayName)),
      ),
    ).toHaveLength(4);

    const syntheticContactAuditIds = new Set(
      SYNTHETIC_CONTACT_NAMES.map((_, index) => fixtureId("60000000", index + 1)),
    );
    for (const fixture of threadFixtures) {
      const linkedPeople = fixture.participants.filter((key) => people[key].contactIndex !== null);
      expect(
        linkedPeople.length,
        `${fixture.name ?? fixture.subject ?? fixture.account} needs a linked contact`,
      ).toBeGreaterThan(0);

      const resolvesToAuditedContact = linkedPeople.some((key) => {
        const person = people[key];
        const contactIndex = person.contactIndex;
        if (contactIndex === null) return false;
        if (!syntheticContactAuditIds.has(fixtureId("60000000", contactIndex + 1))) return false;

        if (fixture.account === "google") return person.email === SYNTHETIC_CONTACT_EMAIL_ADDRESSES[contactIndex];

        const expectedValue = fixture.account === "linkedin" ? person.linkedin : person.phone;
        return identifiers.some(
          (identifier) =>
            identifier.contactId === context.contactIds[contactIndex] &&
            identifier.provider === fixture.account &&
            identifier.value === expectedValue,
        );
      });

      expect(
        resolvesToAuditedContact,
        `${fixture.name ?? fixture.subject ?? fixture.account} must resolve to an audited contact`,
      ).toBe(true);
    }

    const expectedAvatarByName = {
      "Amin Hassan": "amin-hassan.png",
      "Anna Müller": "anna-mueller.png",
      "Clara Neumann": "clara-neumann.png",
      "Jonas Weber": "jonas-weber.png",
      "Leon Becker": "leon-becker.png",
      "Marco Silva": "marco-silva.png",
      "Max Bergmann": "max-bergmann.png",
      "Rashid Malik": "rashid-malik.png",
      "Sophie Wagner": "sophie-wagner.png",
      "Yasmin Farouk": "yasmin-farouk.png",
    } as const;
    for (const participant of participants) {
      const name = String(participant.displayName) as keyof typeof expectedAvatarByName;
      expect(participant.pictureUrl).toBe(
        `https://customermates.com/demo/avatars/photos/${expectedAvatarByName[name]}`,
      );
    }
    for (const call of records.participants) {
      expect(call.where).toEqual({
        messagingThreadId_providerUserId: {
          messagingThreadId: call.create.messagingThreadId,
          providerUserId: call.create.providerUserId,
        },
      });
    }
    expectCanonicalUpdates(records.participants);

    expect(messages).toHaveLength(126);
    expect(stringsByCount(messages, "provider")).toEqual({
      google: 51,
      linkedin: 40,
      whatsapp: 35,
    });
    expect(new Set(messages.map(({ direction }) => direction))).toEqual(new Set(["inbound", "outbound"]));
    expectCanonicalUpdates(records.messages);
    for (const call of records.messages) {
      expect(call.where).toEqual({
        connectedAccountId_unipileMessageId: {
          connectedAccountId: call.create.connectedAccountId,
          unipileMessageId: call.create.unipileMessageId,
        },
      });
    }

    const threadsById = new Map(threads.map((thread) => [String(thread.id), thread]));
    const accountsById = new Map(accounts.map((account) => [String(account.id), account]));
    const messagesByThread = Map.groupBy(messages, (message) => String(message.messagingThreadId));

    for (const message of messages) {
      const thread = threadsById.get(String(message.messagingThreadId));
      expect(thread).toBeDefined();
      expect(message).toMatchObject({
        attachmentsMeta: [],
        companyId: context.companyId,
        isDeleted: false,
        isDraft: false,
        isEvent: false,
        isHidden: false,
        origin: "external",
        provider: thread?.provider,
      });
      expect(message.connectedAccountId).toBe(thread?.connectedAccountId);
      expect(accountsById.get(String(message.connectedAccountId))?.provider).toBe(message.provider);

      const sender = message.sender as FixtureRow;
      const senderName = String(sender.displayName) as keyof typeof expectedAvatarByName;
      expect(sender.pictureUrl).toBe(
        `https://customermates.com/demo/avatars/photos/${expectedAvatarByName[senderName]}`,
      );

      if (message.provider === "google") {
        expect(String(message.bodyHtml)).toContain("<p>");
        expect(message.folderIds).toEqual(
          message.direction === "outbound" ? ["demo-google-sent"] : ["demo-google-inbox"],
        );
      } else {
        expect(message.bodyHtml).toBeNull();
        expect(message.folderIds).toEqual([]);
      }
    }

    const expectedMessageCounts = threadFixtures.map((thread) => thread.messages.length);
    expect(expectedMessageCounts).toHaveLength(25);
    expect(expectedMessageCounts.every((count) => count >= 5)).toBe(true);
    for (const [threadIndex, thread] of threads.entries()) {
      const threadMessages = messagesByThread.get(String(thread.id)) ?? [];
      expect(threadMessages).toHaveLength(expectedMessageCounts[threadIndex]);
      const latest = threadMessages
        .toSorted((left, right) => (left.sentAt as Date).getTime() - (right.sentAt as Date).getTime())
        .at(-1);
      expect(latest?.sentAt).toEqual(thread.lastMessageAt);
      expect(latest?.bodyText).toBe(thread.lastMessagePreview);
      expect(latest?.direction === "outbound").toBe(thread.lastMessageIsSender);
    }

    const resetContracts = [
      [records.accountActivityDeletes, "26000000-"],
      [records.calendarEventDeletes, "25000000-"],
      [records.messageDeletes, "19000000-"],
      [records.participantDeletes, "18000000-"],
      [records.contactIdentifierDeletes, "1a000000-"],
    ] as const;
    for (const [deletes, idPrefix] of resetContracts) {
      expect(deletes).toHaveLength(1);
      expect(deletes[0]?.where).toEqual({
        companyId: context.companyId,
        id: { startsWith: idPrefix },
      });
    }
    expect(records.calendarDeletes).toEqual([
      {
        where: {
          companyId: context.companyId,
          events: { none: {} },
          id: { startsWith: "24000000-" },
        },
      },
    ]);
    expect(records.threadDeletes).toEqual([
      {
        where: {
          companyId: context.companyId,
          id: { startsWith: "17000000-" },
          messages: { none: {} },
          participants: { none: {} },
        },
      },
    ]);
    expect(records.connectedAccountDeletes).toEqual([
      {
        where: {
          companyId: context.companyId,
          id: {
            notIn: createdRows(records.connectedAccounts).map(({ id }) => id),
            startsWith: "16000000-",
          },
        },
      },
    ]);
  });

  it("preserves synthetic inbox chronology when a persistent Preview database is reseeded", async () => {
    vi.stubEnv("APP_MODE", appMode);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T10:02:00.000Z"));
    const { prisma, records } = recordingPrisma();

    await seedDemoMessagingFixtures(prisma, context);
    const firstAccountCreatedAt = createdRows(records.connectedAccounts)[0]?.createdAt;
    const firstThreadCreatedAt = createdRows(records.threads).map(({ createdAt }) => createdAt);
    const firstThreadTimes = createdRows(records.threads).map(({ lastMessageAt }) => lastMessageAt);
    const firstMessageCreatedAt = createdRows(records.messages).map(({ createdAt }) => createdAt);
    const firstMessageTimes = createdRows(records.messages).map(({ sentAt }) => sentAt);
    const firstCalendarEventTimes = createdRows(records.calendarEvents).map(({ startsAt, endsAt }) => ({
      endsAt,
      startsAt,
    }));
    const firstAccountActivityTimes = createdRows(records.accountActivities).map(({ occurredAt }) => occurredAt);
    const newestMessageAt = Math.max(...firstMessageTimes.map((sentAt) => (sentAt as Date).getTime()));
    const oldestMessageAt = Math.min(...firstMessageTimes.map((sentAt) => (sentAt as Date).getTime()));

    expect(newestMessageAt).toBeLessThanOrEqual(Date.now());
    expect(newestMessageAt).toBeGreaterThan(Date.now() - 15 * 60_000);
    expect(oldestMessageAt).toBeGreaterThan(Date.now() - 365 * 24 * 60 * 60_000);
    expect(oldestMessageAt).toBeLessThan(Date.now() - 330 * 24 * 60 * 60_000);
    expect(firstCalendarEventTimes.every(({ endsAt }) => (endsAt as Date).getTime() <= Date.now())).toBe(true);
    expect(firstAccountActivityTimes.every((occurredAt) => (occurredAt as Date).getTime() <= Date.now())).toBe(true);

    vi.setSystemTime(new Date("2026-07-18T12:47:00.000Z"));
    await seedDemoMessagingFixtures(prisma, context);

    const secondAccounts = createdRows(records.connectedAccounts).slice(3);
    const secondThreads = createdRows(records.threads).slice(25);
    const secondMessages = createdRows(records.messages).slice(126);
    const secondCalendarEvents = createdRows(records.calendarEvents).slice(1);
    const secondAccountActivities = createdRows(records.accountActivities).slice(1);

    expect(secondAccounts[0]?.createdAt).toEqual(firstAccountCreatedAt);
    expect(secondThreads.map(({ createdAt }) => createdAt)).toEqual(firstThreadCreatedAt);
    expect(secondThreads.map(({ lastMessageAt }) => lastMessageAt)).toEqual(firstThreadTimes);
    expect(secondMessages.map(({ createdAt }) => createdAt)).toEqual(firstMessageCreatedAt);
    expect(secondMessages.map(({ sentAt }) => sentAt)).toEqual(firstMessageTimes);
    expect(
      secondCalendarEvents.map(({ startsAt, endsAt }) => ({
        endsAt,
        startsAt,
      })),
    ).toEqual(firstCalendarEventTimes);
    expect(secondAccountActivities.map(({ occurredAt }) => occurredAt)).toEqual(firstAccountActivityTimes);
    for (const [index, { create, update }] of records.connectedAccounts.entries()) {
      expect(update).toMatchObject(SYNTHETIC_SEED_TIMELINE.connectedAccount(index % 3));
      expect(update.lastSyncedAt).toEqual(create.lastSyncedAt);
    }
    for (const { create, update } of records.threads) {
      expect(update.createdAt).toEqual(create.createdAt);
      expect(update.lastMessageAt).toEqual(create.lastMessageAt);
    }
    for (const { create, update } of records.messages) {
      expect(update.createdAt).toEqual(create.createdAt);
      expect(update.sentAt).toEqual(create.sentAt);
    }
  });

  it("uses ids returned by natural-key upserts throughout the seeded graph", async () => {
    vi.stubEnv("APP_MODE", appMode);
    const { prisma, records, upsertResultIds } = recordingPrisma();
    const existingAccountId = "existing-google-account";
    const existingLinkedinAccountId = "existing-linkedin-account";
    const existingCalendarId = "existing-google-calendar";
    const existingThreadId = "existing-google-thread";
    upsertResultIds.connectedAccounts.push(existingAccountId, existingLinkedinAccountId);
    upsertResultIds.calendars.push(existingCalendarId);
    upsertResultIds.threads.push(existingThreadId);

    await seedDemoMessagingFixtures(prisma, context);

    const firstThread = records.threads[0];
    if (!firstThread) throw new Error("Missing first synthetic messaging thread");
    const firstThreadFixture = threadFixtures[0];
    if (!firstThreadFixture) throw new Error("Missing first synthetic messaging fixture");
    expect(firstThread.create.connectedAccountId).toBe(existingAccountId);
    expect(firstThread.where).toEqual({
      connectedAccountId_unipileThreadId: {
        connectedAccountId: existingAccountId,
        unipileThreadId: firstThread.create.unipileThreadId,
      },
    });
    expect(records.calendarEvents[0]?.create).toMatchObject({
      calendarId: existingCalendarId,
      connectedAccountId: existingAccountId,
    });
    expect(records.accountActivities[0]?.create).toMatchObject({
      connectedAccountId: existingLinkedinAccountId,
    });

    const firstThreadParticipantCount = 1 + firstThreadFixture.participants.length;
    expect(
      records.participants
        .slice(0, firstThreadParticipantCount)
        .every(({ create }) => create.messagingThreadId === existingThreadId),
    ).toBe(true);
    expect(
      records.messages
        .slice(0, firstThreadFixture.messages.length)
        .every(
          ({ create }) =>
            create.connectedAccountId === existingAccountId && create.messagingThreadId === existingThreadId,
        ),
    ).toBe(true);

    const accountCleanup = records.connectedAccountDeletes[0]?.where.id as { notIn: string[] };
    expect(accountCleanup.notIn).toContain(existingAccountId);
    expect(accountCleanup.notIn).toContain(existingLinkedinAccountId);
    expect(accountCleanup.notIn).not.toContain(records.connectedAccounts[0]?.create.id);
    expect(records.threadDeletes[0]?.where).toEqual({
      companyId: context.companyId,
      id: { startsWith: "17000000-" },
      messages: { none: {} },
      participants: { none: {} },
    });
    expect(records.participantDeletes[0]?.where).toEqual({
      companyId: context.companyId,
      id: { startsWith: "18000000-" },
    });
    expect(records.messageDeletes[0]?.where).toEqual({
      companyId: context.companyId,
      id: { startsWith: "19000000-" },
    });
  });

  it("rebuilds an occupied positional participant id before creating the canonical fixture", async () => {
    vi.stubEnv("APP_MODE", appMode);
    const { delegates, prisma, records } = recordingPrisma();
    const plannedId = fixtureId("18000000", 1);
    const participantRows = new Map<string, FixtureRow>([
      [
        plannedId,
        {
          companyId: context.companyId,
          id: plannedId,
          identifier: "stale-participant@example.com",
          messagingThreadId: "stale-thread",
          providerUserId: "stale-provider-user",
        },
      ],
    ]);
    const participantEvents: string[] = [];

    delegates.participants.deleteMany.mockImplementation((input: DeleteManyInput) => {
      records.participantDeletes.push(input);
      participantEvents.push("deleteMany");
      const idFilter = input.where.id as { startsWith: string };
      let count = 0;
      for (const [id, row] of participantRows) {
        if (row.companyId !== input.where.companyId || !id.startsWith(idFilter.startsWith)) continue;
        participantRows.delete(id);
        count += 1;
      }
      return Promise.resolve({ count });
    });
    delegates.participants.upsert.mockImplementation((input: UpsertInput) => {
      records.participants.push(input);
      participantEvents.push(`upsert:${String(input.create.id)}`);
      const naturalKey = input.where.messagingThreadId_providerUserId as {
        messagingThreadId: string;
        providerUserId: string;
      };
      const existing = [...participantRows.values()].find(
        (row) =>
          row.messagingThreadId === naturalKey.messagingThreadId && row.providerUserId === naturalKey.providerUserId,
      );
      if (existing) {
        const updated = { ...existing, ...input.update };
        participantRows.set(String(existing.id), updated);
        return Promise.resolve(updated);
      }

      const id = String(input.create.id);
      if (participantRows.has(id)) return Promise.reject(new Error(`Participant id collision: ${id}`));
      participantRows.set(id, input.create);
      return Promise.resolve(input.create);
    });

    await expect(seedDemoMessagingFixtures(prisma, context)).resolves.toBeUndefined();

    expect(participantEvents[0]).toBe("deleteMany");
    expect(participantEvents[1]).toBe(`upsert:${plannedId}`);
    expect(participantRows.get(plannedId)).toMatchObject({
      companyId: context.companyId,
      displayName: "Max Bergmann",
      providerUserId: "demo-google-self",
    });
  });

  it("fails explicitly when two user-owned identifier rows hold the desired unique keys", async () => {
    vi.stubEnv("APP_MODE", appMode);
    const { delegates, prisma, records } = recordingPrisma();
    const userOwnedIdentifiers = [
      {
        channelClass: "linkedin",
        companyId: context.companyId,
        id: "ui-linkedin-value-row",
        messagingId: "another-messaging-id",
        provider: "linkedin",
        value: people.leon.linkedin,
      },
      {
        channelClass: "linkedin",
        companyId: context.companyId,
        id: "ui-linkedin-messaging-row",
        messagingId: "demo-linkedin-leon",
        provider: "linkedin",
        value: "another-linkedin-value",
      },
    ];
    delegates.contactIdentifiers.findMany.mockImplementation((input?: FixtureRow) => {
      const where = input?.where as FixtureRow | undefined;
      const filters = (where?.OR ?? []) as FixtureRow[];
      const matches = userOwnedIdentifiers.filter(
        (row) =>
          row.companyId === where?.companyId &&
          filters.some((filter) =>
            Object.entries(filter).every(([key, value]) => row[key as keyof typeof row] === value),
          ),
      );
      return Promise.resolve(matches);
    });

    await expect(seedDemoMessagingFixtures(prisma, context)).rejects.toThrow(
      "Conflicting demo contact identifiers for leon (linkedin)",
    );

    expect(records.contactIdentifierUpdates).toHaveLength(0);
    expect(records.contactIdentifierDeletes).toEqual([
      {
        where: {
          companyId: context.companyId,
          id: { startsWith: "1a000000-" },
        },
      },
    ]);
    expect(userOwnedIdentifiers.map(({ id }) => id)).toEqual(["ui-linkedin-value-row", "ui-linkedin-messaging-row"]);
  });

  it("reuses a channel recreated by the UI under its natural key", async () => {
    vi.stubEnv("APP_MODE", appMode);
    const { delegates, prisma, records } = recordingPrisma();

    await seedDemoMessagingFixtures(prisma, context);
    delegates.contactIdentifiers.findMany.mockImplementation((input?: FixtureRow) => {
      const matchesLeon = JSON.stringify(input?.where).includes("leon-becker.linkedin.example");
      return Promise.resolve(matchesLeon ? [{ id: "ui-recreated-linkedin-channel" }] : []);
    });

    await expect(seedDemoMessagingFixtures(prisma, context)).resolves.toBeUndefined();

    const secondSeedCreates = records.contactIdentifiers.slice(4).map(({ create }) => create);
    expect(secondSeedCreates).toHaveLength(3);
    expect(secondSeedCreates.some(({ value }) => value === "leon-becker.linkedin.example")).toBe(false);
    expect(records.contactIdentifierUpdates).toEqual([
      {
        data: records.contactIdentifiers[0]?.update,
        where: { id: "ui-recreated-linkedin-channel" },
      },
    ]);

    expect(records.contactIdentifierDeletes.at(-1)?.where).toEqual({
      companyId: context.companyId,
      id: { startsWith: "1a000000-" },
    });
  });
});
