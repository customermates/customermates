import type { PrismaClient } from "@/generated/prisma";

import { afterEach, describe, expect, it, vi } from "vitest";

import { SYNTHETIC_COMPANY_USERS } from "@/core/config/synthetic-seed-user";

import { seedDemoMessagingFixtures } from "../seeds/messaging/seed";
import { people, threads as threadFixtures } from "../seeds/messaging/fixtures";
import { SYNTHETIC_CONTACT_EMAIL_ADDRESSES, SYNTHETIC_CONTACT_NAMES } from "../seeds/contacts";
import { fixtureId } from "../seeds/helpers";

type FixtureRow = Record<string, unknown>;
type UpsertInput = {
  create: FixtureRow;
  update: FixtureRow;
  where: FixtureRow;
};

type DeleteManyInput = {
  where: FixtureRow;
};

function recordingDelegate() {
  const calls: UpsertInput[] = [];
  const deleteManyCalls: DeleteManyInput[] = [];

  return {
    calls,
    deleteManyCalls,
    delegate: {
      deleteMany: vi.fn((input: DeleteManyInput) => {
        deleteManyCalls.push(input);
        return Promise.resolve({ count: 0 });
      }),
      upsert: vi.fn((input: UpsertInput) => {
        calls.push(input);
        return Promise.resolve(input.create);
      }),
    },
  };
}

function recordingPrisma() {
  const connectedAccounts = recordingDelegate();
  const contactIdentifiers = recordingDelegate();
  const messages = recordingDelegate();
  const participants = recordingDelegate();
  const threads = recordingDelegate();

  return {
    prisma: {
      connectedAccount: connectedAccounts.delegate,
      contactIdentifier: contactIdentifiers.delegate,
      messagingMessage: messages.delegate,
      messagingThread: threads.delegate,
      messagingThreadParticipant: participants.delegate,
    } as unknown as PrismaClient,
    records: {
      connectedAccounts: connectedAccounts.calls,
      connectedAccountDeletes: connectedAccounts.deleteManyCalls,
      contactIdentifiers: contactIdentifiers.calls,
      contactIdentifierDeletes: contactIdentifiers.deleteManyCalls,
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

function stringsByCount(rows: FixtureRow[], property: string): Record<string, number> {
  return rows.reduce<Record<string, number>>((counts, row) => {
    const value = String(row[property]);
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

const context = {
  baseUrl: "https://demo.example",
  companyId: "10000000-0000-4000-8000-000000000001",
  contactIds: Array.from({ length: 30 }, (_, index) => `contact-${index}`),
  seedUserEmail: SYNTHETIC_COMPANY_USERS.maxBergmann.email,
  userId: "30000000-0000-4000-8000-000000000001",
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe.each(["demo", "cloud"] as const)("synthetic messaging fixtures in APP_MODE=%s", (appMode) => {
  it("creates the complete connected-account and inbox graph", async () => {
    vi.stubEnv("APP_MODE", appMode);
    const { prisma, records } = recordingPrisma();

    await seedDemoMessagingFixtures(prisma, context);

    const accounts = createdRows(records.connectedAccounts);
    const identifiers = createdRows(records.contactIdentifiers);
    const messages = createdRows(records.messages);
    const participants = createdRows(records.participants);
    const threads = createdRows(records.threads);

    expect(accounts).toHaveLength(3);
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
    for (const call of records.contactIdentifiers) {
      expect(call.where).toEqual({ id: call.create.id });
      expect(call.update).toMatchObject({
        channelClass: call.create.channelClass,
        companyId: context.companyId,
        contactId: call.create.contactId,
        displayName: call.create.displayName,
        provider: call.create.provider,
        value: call.create.value,
      });
    }
    for (const account of accounts) {
      expect(account).toMatchObject({
        companyId: context.companyId,
        ownerAvatarUrl: "https://demo.example/demo/avatars/photos/max-bergmann.png",
        shared: false,
        status: "ok",
        syncing: false,
        userId: context.userId,
      });
      expect(String(account.unipileAccountId)).toMatch(/^demo-fixture-/);
    }

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
          subject: "ASML retainer — contract review",
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
      expect(participant.pictureUrl).toBe(`https://demo.example/demo/avatars/photos/${expectedAvatarByName[name]}`);
    }
    for (const call of records.participants) {
      expect(call.where).toEqual({ id: call.create.id });
      expect(call.update).toMatchObject({
        companyId: context.companyId,
        identifier: call.create.identifier,
        messagingThreadId: call.create.messagingThreadId,
        pictureUrl: call.create.pictureUrl,
        provider: call.create.provider,
        providerUserId: call.create.providerUserId,
      });
    }

    expect(messages).toHaveLength(126);
    expect(stringsByCount(messages, "provider")).toEqual({
      google: 51,
      linkedin: 40,
      whatsapp: 35,
    });
    expect(new Set(messages.map(({ direction }) => direction))).toEqual(new Set(["inbound", "outbound"]));

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
      expect(sender.pictureUrl).toBe(`https://demo.example/demo/avatars/photos/${expectedAvatarByName[senderName]}`);

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

    const cleanupContracts = [
      [records.messageDeletes, "19000000-", 126],
      [records.participantDeletes, "18000000-", 59],
      [records.threadDeletes, "17000000-", 25],
      [records.contactIdentifierDeletes, "1a000000-", 4],
      [records.connectedAccountDeletes, "16000000-", 3],
    ] as const;
    for (const [deletes, idPrefix, expectedDesiredCount] of cleanupContracts) {
      expect(deletes).toHaveLength(1);
      expect(deletes[0]?.where.companyId).toBe(context.companyId);
      const idFilter = deletes[0]?.where.id as {
        notIn: string[];
        startsWith: string;
      };
      expect(idFilter.startsWith).toBe(idPrefix);
      expect(idFilter.notIn).toHaveLength(expectedDesiredCount);
      expect(new Set(idFilter.notIn).size).toBe(expectedDesiredCount);
      expect(idFilter.notIn.every((id) => id.startsWith(idPrefix))).toBe(true);
    }
  });
});
