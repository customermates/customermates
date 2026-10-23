import type { PrismaClient } from "@/generated/prisma";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EmailSettingsSchema,
  SIGNATURE_LOGO_URL,
  SignatureTemplate,
  defaultEmailSettings,
  emailLinkContrast,
} from "@/ee/messaging/email-settings";
import { SIGNATURE_DELIMITER } from "@/ee/messaging/outbound/email-signature";
import { renderEmailMarkdown } from "@/ee/messaging/outbound/render-signature";

import { fixtureId, workspaceFixtureId } from "../seeds/helpers";
import type { MessagingFixtureProvider, WorkspaceMessagingFixtures } from "../seeds/messaging/fixtures";
import { messagingAccountId, messagingUnipileAccountId, seedWorkspaceMessaging } from "../seeds/messaging/seed";
import { solutionWorkspacePlan } from "../seeds/solutions/seed-solutions";
import { buildSolutionRecordData } from "../seeds/solutions/solution-data";
import { buildSolutionMessaging } from "../seeds/solutions/solution-messaging";
import type { SolutionWorkspace } from "../seeds/solutions/solution-workspaces";
import { SOLUTION_WORKSPACES, TEAM_SOLUTION_WORKSPACE } from "../seeds/solutions/solution-workspaces";
import { SYNTHETIC_SEED_TIMELINE } from "../seeds/timeline";

type FixtureRow = Record<string, unknown>;
type UpsertInput = { create: FixtureRow; update: FixtureRow; where: FixtureRow };
type UpdateInput = { data: FixtureRow; where: FixtureRow };
type DeleteManyInput = { where: FixtureRow };

const MINUTE = 60_000;
const ACCOUNT_ORDER: readonly MessagingFixtureProvider[] = [
  "google",
  "linkedin",
  "whatsapp",
  "instagram",
  "telegram",
  "outlook",
];

function workspaceMessaging(workspace: SolutionWorkspace): WorkspaceMessagingFixtures {
  const plan = solutionWorkspacePlan(workspace);
  const fixtures = buildSolutionMessaging(
    plan.workspace,
    plan.content,
    buildSolutionRecordData(plan.workspace, plan.content, plan.model),
  );
  if (!fixtures) throw new Error(`${workspace.slug} has no conversations`);
  return fixtures;
}

const teamFixtures = workspaceMessaging(TEAM_SOLUTION_WORKSPACE);
const germanWorkspace = SOLUTION_WORKSPACES.find((workspace) => workspace.solution.id === "smb" && !workspace.team);
if (!germanWorkspace) throw new Error("Missing the German small-business workspace");
const germanFixtures = workspaceMessaging(germanWorkspace);

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
  const messages = recordingDelegate();
  const participants = recordingDelegate();
  const threads = recordingDelegate();
  const threadRecordLinks: FixtureRow[] = [];
  const threadRecordLinkEvents: string[] = [];
  connectedAccounts.delegate.findFirst.mockImplementation((input?: FixtureRow) => {
    const where = input?.where as { companyId: string; unipileAccountId: { in: string[] } };
    const persisted = connectedAccounts.calls.find(
      ({ create }) =>
        create.companyId === where.companyId && where.unipileAccountId.in.includes(String(create.unipileAccountId)),
    );
    return Promise.resolve(persisted ? { lastSyncedAt: persisted.create.lastSyncedAt } : null);
  });

  return {
    prisma: {
      accountActivity: accountActivities.delegate,
      calendar: calendars.delegate,
      calendarEvent: calendarEvents.delegate,
      connectedAccount: connectedAccounts.delegate,
      messagingMessage: messages.delegate,
      messagingThread: threads.delegate,
      messagingThreadParticipant: participants.delegate,
      messagingThreadRecordLink: {
        deleteMany: vi.fn(({ where }: DeleteManyInput) => {
          threadRecordLinkEvents.push(`delete:${String(where.threadId)}`);
          return Promise.resolve({ count: 0 });
        }),
        createMany: vi.fn(({ data }: { data: FixtureRow[] }) => {
          threadRecordLinkEvents.push(`create:${String(data[0]?.threadId)}`);
          threadRecordLinks.push(...data);
          return Promise.resolve({ count: data.length });
        }),
      },
    } as unknown as PrismaClient,
    delegates: {
      participants: participants.delegate,
      threads: threads.delegate,
    },
    upsertResultIds: {
      calendars: calendars.upsertResultIds,
      connectedAccounts: connectedAccounts.upsertResultIds,
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
      messages: messages.calls,
      messageDeletes: messages.deleteManyCalls,
      participants: participants.calls,
      participantDeletes: participants.deleteManyCalls,
      participantUpdates: participants.updateCalls,
      threadRecordLinkEvents,
      threadRecordLinks,
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

function stringsByCount(rows: readonly FixtureRow[], property: string): Record<string, number> {
  return rows.reduce<Record<string, number>>((counts, row) => {
    const value = String(row[property]);
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function seededProviders(fixtures: WorkspaceMessagingFixtures): MessagingFixtureProvider[] {
  return ACCOUNT_ORDER.filter((provider) => fixtures.accounts.includes(provider));
}

function participantCount(fixtures: WorkspaceMessagingFixtures): number {
  return fixtures.threads.reduce((count, thread) => count + 1 + thread.participants.length, 0);
}

const isEmailProvider = (provider: unknown) => provider === "google" || provider === "outlook";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe.each(["demo", "cloud"] as const)("workspace messaging fixtures in APP_MODE=%s", (appMode) => {
  it("creates the complete connected-account and inbox graph", async () => {
    vi.stubEnv("APP_MODE", appMode);
    const fixtures = teamFixtures;
    const { prisma, records } = recordingPrisma();

    await seedWorkspaceMessaging(prisma, fixtures);

    const accounts = createdRows(records.connectedAccounts);
    const accountActivities = createdRows(records.accountActivities);
    const calendarEvents = createdRows(records.calendarEvents);
    const calendars = createdRows(records.calendars);
    const messages = createdRows(records.messages);
    const participants = createdRows(records.participants);
    const threads = createdRows(records.threads);
    const providers = seededProviders(fixtures);

    expect(fixtures.tag).toBe("0000");
    expect(new Set(fixtures.accounts)).toEqual(new Set(ACCOUNT_ORDER));
    expect(accounts.map(({ provider }) => provider)).toEqual(providers);
    for (const [index, provider] of providers.entries()) {
      const account = accounts[index];
      const email = isEmailProvider(provider);
      expect(account).toMatchObject({
        companyId: fixtures.companyId,
        displayName: expect.stringMatching(new RegExp(`^${fixtures.self.name} · `)),
        emailAddress: email ? fixtures.seedUserEmail : null,
        hasCalendar: email,
        hasMessaging: true,
        id: fixtureId("16000000", ACCOUNT_ORDER.indexOf(provider) + 1),
        linkedinProducts: provider === "linkedin" ? ["classic"] : [],
        ownerAvatarUrl: fixtures.self.avatarPath,
        shared: false,
        status: "ok",
        syncing: false,
        unipileAccountId: `demo-fixture-${provider}-account`,
        userId: fixtures.userId,
      });
      expect(account?.id).toBe(messagingAccountId(fixtures.tag, provider));
      expect(records.connectedAccounts[index]?.where).toEqual({ unipileAccountId: account?.unipileAccountId });
      expect(records.connectedAccounts[index]?.update).toMatchObject(
        SYNTHETIC_SEED_TIMELINE.connectedAccount(ACCOUNT_ORDER.indexOf(provider)),
      );

      if (!email) {
        expect(account?.signature).toBeUndefined();
        expect(account?.signatureFields).toBeUndefined();
        expect(account?.folders).toEqual([]);
        continue;
      }
      expect(String(account?.signature)).toContain(fixtures.seedUserEmail);
      expect(String(account?.signature)).toContain(fixtures.self.companyName);
      const settings = EmailSettingsSchema.safeParse(account?.signatureFields);
      expect(settings.success).toBe(true);
      expect(settings.data?.signature.template).toBe(SignatureTemplate.plain);
      expect(settings.data?.signature.enabled).toBe(true);
      expect(emailLinkContrast(String(settings.data?.appearance.linkHex)).readable).toBe(true);

      const providerThreads = fixtures.threads.filter((thread) => thread.account === provider);
      const providerMessages = providerThreads.flatMap((thread) => thread.messages);
      expect(account?.folders).toEqual([
        {
          id: `demo-${provider}-inbox`,
          name: "Inbox",
          role: "INBOX",
          totalCount: providerMessages.filter((message) => message.sender !== "self").length,
          unreadCount: providerThreads.filter((thread) => thread.state === "unread").length,
        },
        {
          id: `demo-${provider}-sent`,
          name: "Sent",
          role: "SENT",
          totalCount: providerMessages.filter((message) => message.sender === "self").length,
          unreadCount: 0,
        },
      ]);
      expect(account?.sentFolderIds).toEqual([`demo-${provider}-sent`]);
      expect(account?.selectedFolderIds).toEqual([`demo-${provider}-inbox`, `demo-${provider}-sent`]);
    }
    expectCanonicalUpdates(records.connectedAccounts, ["id", "unipileAccountId"]);

    const anchor = new Date((accounts[0]?.lastSyncedAt as Date).getTime() + 5 * MINUTE);
    const calendar = fixtures.calendar;
    if (!calendar) throw new Error("The team workspace needs a calendar");
    const google = accounts.find(({ provider }) => provider === "google");
    expect(calendars).toHaveLength(1);
    expect(calendars[0]).toMatchObject({
      companyId: fixtures.companyId,
      connectedAccountId: google?.id,
      id: fixtureId("24000000", 1),
      name: calendar.name,
      timezone: calendar.timezone,
      unipileCalendarId: "demo-fixture-google-calendar",
    });
    expect(records.calendars[0]?.where).toEqual({
      connectedAccountId_unipileCalendarId: {
        connectedAccountId: google?.id,
        unipileCalendarId: "demo-fixture-google-calendar",
      },
    });
    expectCanonicalUpdates(records.calendars, ["id", "unipileCalendarId"]);

    expect(calendarEvents).toHaveLength(calendar.events.length);
    for (const [index, fixture] of calendar.events.entries()) {
      const event = calendarEvents[index];
      const unipileEventId = `demo-fixture-calendar-event-${index + 1}`;
      expect(event).toMatchObject({
        allDay: false,
        attendeeEmails: [
          ...fixture.attendees.map(({ person }) => fixtures.people[person]?.email?.toLowerCase()),
          fixtures.seedUserEmail.toLowerCase(),
        ],
        calendarId: calendars[0]?.id,
        companyId: fixtures.companyId,
        conferenceUrl: null,
        connectedAccountId: google?.id,
        id: fixtureId("25000000", index + 1),
        status: "confirmed",
        title: fixture.title,
        unipileEventId,
      });
      expect(event?.startsAt).toEqual(new Date(anchor.getTime() - fixture.startsMinutesAgo * MINUTE));
      expect((event?.endsAt as Date).getTime() - (event?.startsAt as Date).getTime()).toBe(
        fixture.durationMinutes * MINUTE,
      );
      expect(event?.attendees).toEqual(
        fixture.attendees.map(({ person, responseStatus }) =>
          expect.objectContaining({ displayName: fixtures.people[person]?.displayName, responseStatus }),
        ),
      );
      expect(event?.organizer).toEqual(
        expect.objectContaining({
          displayName: fixtures.self.name,
          email: fixtures.seedUserEmail.toLowerCase(),
          isOrganizer: true,
        }),
      );
      expect(records.calendarEvents[index]?.where).toEqual({
        connectedAccountId_unipileEventId: { connectedAccountId: google?.id, unipileEventId },
      });
    }
    expectCanonicalUpdates(records.calendarEvents, ["id", "unipileEventId"]);

    const linkedin = accounts.find(({ provider }) => provider === "linkedin");
    expect(fixtures.linkedinActivities.length).toBeGreaterThan(0);
    expect(accountActivities).toHaveLength(fixtures.linkedinActivities.length);
    for (const [index, fixture] of fixtures.linkedinActivities.entries()) {
      const identifier = `demo-linkedin-${fixture.person}`;
      expect(accountActivities[index]).toMatchObject({
        companyId: fixtures.companyId,
        connectedAccountId: linkedin?.id,
        id: fixtureId("26000000", index + 1),
        identifier,
        kind: "linkedin_connection_accepted",
        payload: expect.objectContaining({ fullName: fixtures.people[fixture.person]?.displayName }),
      });
      expect(accountActivities[index]?.occurredAt).toEqual(
        new Date(anchor.getTime() - fixture.occurredMinutesAgo * MINUTE),
      );
      expect(records.accountActivities[index]?.where).toEqual({
        connectedAccountId_kind_identifier: {
          connectedAccountId: linkedin?.id,
          identifier,
          kind: "linkedin_connection_accepted",
        },
      });
    }
    expectCanonicalUpdates(records.accountActivities, ["id", "identifier", "kind"]);

    expect(threads).toHaveLength(fixtures.threads.length);
    expectCanonicalUpdates(records.threads);
    for (const [index, call] of records.threads.entries()) {
      const fixture = fixtures.threads[index];
      expect(call.create).toMatchObject({
        companyId: fixtures.companyId,
        connectedAccountId: messagingAccountId(fixtures.tag, fixture?.account ?? "google"),
        id: fixtureId("17000000", index + 1),
        name: fixture?.name,
        provider: fixture?.account,
        sharedToCrm: true,
        state: fixture?.state,
        subject: fixture?.subject,
        type: fixture?.type,
        unipileThreadId: `demo-fixture-thread-${index + 1}`,
      });
      expect(call.where).toEqual({
        connectedAccountId_unipileThreadId: {
          connectedAccountId: call.create.connectedAccountId,
          unipileThreadId: call.create.unipileThreadId,
        },
      });
    }
    expect(stringsByCount(threads, "provider")).toEqual(stringsByCount(fixtures.threads, "account"));

    expect(records.threadRecordLinkEvents.filter((event) => event.startsWith("delete:"))).toEqual(
      threads.map(({ id }) => `delete:${String(id)}`),
    );
    for (const [index, thread] of threads.entries()) {
      const links = fixtures.threads[index]?.links ?? [];
      expect(records.threadRecordLinks.filter(({ threadId }) => threadId === thread.id)).toEqual(
        links.map((link) => ({ companyId: fixtures.companyId, threadId: thread.id, ...link })),
      );
      const deleteAt = records.threadRecordLinkEvents.indexOf(`delete:${String(thread.id)}`);
      const createAt = records.threadRecordLinkEvents.indexOf(`create:${String(thread.id)}`);
      if (links.length) expect(createAt).toBe(deleteAt + 1);
      else expect(createAt).toBe(-1);
    }
    expect(fixtures.threads.every(({ links }) => links.length > 0)).toBe(true);
    expect(fixtures.threads.some(({ links }) => links.length > 1)).toBe(true);

    expect(participants).toHaveLength(participantCount(fixtures));
    expect(participants.map(({ id }) => id)).toEqual(participants.map((_, index) => fixtureId("18000000", index + 1)));
    const participantsByThread = Map.groupBy(participants, (participant) => String(participant.messagingThreadId));
    for (const [index, thread] of threads.entries()) {
      const fixture = fixtures.threads[index];
      const threadParticipants = participantsByThread.get(String(thread.id)) ?? [];
      expect(threadParticipants.filter((participant) => participant.isSelf)).toEqual([
        expect.objectContaining({
          displayName: fixtures.self.name,
          pictureUrl: fixtures.self.avatarPath,
          providerUserId: `demo-${fixture?.account}-self`,
        }),
      ]);
      expect(
        threadParticipants.filter((participant) => !participant.isSelf).map(({ providerUserId }) => providerUserId),
      ).toEqual(fixture?.participants.map((key) => `demo-${fixture.account}-${key}`));
    }
    for (const participant of participants.filter(({ isSelf }) => !isSelf)) {
      const key = String(participant.providerUserId).replace(`demo-${String(participant.provider)}-`, "");
      const person = fixtures.people[key];
      expect(participant).toMatchObject({
        companyId: fixtures.companyId,
        displayName: person?.displayName,
        pictureUrl: person?.avatarPath ?? "",
      });
      if (isEmailProvider(participant.provider)) expect(participant.identifier).toBe(person?.email);
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

    const fixtureMessages = fixtures.threads.flatMap((thread) => thread.messages);
    expect(messages).toHaveLength(fixtureMessages.length);
    expect(messages.map(({ id }) => id)).toEqual(messages.map((_, index) => fixtureId("19000000", index + 1)));
    const drafts = messages.filter(({ isDraft }) => isDraft === true);
    expect(drafts).toHaveLength(fixtureMessages.filter(({ draft }) => draft === true).length);
    expect(drafts.length).toBeGreaterThan(0);
    expect(drafts.every(({ direction }) => direction === "outbound")).toBe(true);
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

    const externalEmailHtml = new Set(fixtureMessages.flatMap((message) => (message.html ? [message.html] : [])));
    expect(externalEmailHtml.size).toBe(2);
    expect([...externalEmailHtml].filter((html) => /prefers-color-scheme:\s*dark/.test(html))).toHaveLength(1);
    const threadsById = new Map(threads.map((thread) => [String(thread.id), thread]));
    const accountsById = new Map(accounts.map((account) => [String(account.id), account]));
    for (const [index, message] of messages.entries()) {
      const thread = threadsById.get(String(message.messagingThreadId));
      expect(message).toMatchObject({
        attachmentsMeta: [],
        companyId: fixtures.companyId,
        connectedAccountId: thread?.connectedAccountId,
        isDeleted: false,
        isEvent: false,
        isHidden: false,
        origin: "external",
        provider: thread?.provider,
        unipileMessageId: `demo-fixture-message-${index + 1}`,
      });
      expect(accountsById.get(String(message.connectedAccountId))?.provider).toBe(message.provider);
      const sender = message.sender as FixtureRow;
      expect(message.senderIdentifier).toBe(sender.identifier);

      if (!isEmailProvider(message.provider)) {
        expect(message.bodyHtml).toBeNull();
        expect(message.folderIds).toEqual([]);
        expect(message.providerMessageId).toBeNull();
        continue;
      }
      expect(message.providerMessageId).toBe(`demo-provider-message-0000-${index + 1}`);
      const html = String(message.bodyHtml);
      expect(message.folderIds).toEqual([
        `demo-${String(message.provider)}-${message.direction === "outbound" ? "sent" : "inbox"}`,
      ]);
      if (externalEmailHtml.has(html)) continue;
      expect(html).toContain('data-customermates-email-markdown="true"');
      expect(html).not.toMatch(/<img/i);
      expect(html).not.toContain(SIGNATURE_LOGO_URL);
      if (message.isDraft === true) expect(html.match(/data-customermates-signature/g)).toBeNull();
      else {
        expect(html.match(/data-customermates-signature/g)).toHaveLength(1);
        const linkHexes = [...html.matchAll(/<a[^>]*color:(#[0-9a-f]{6})/gi)].map((match) => match[1]);
        expect(linkHexes.length).toBeGreaterThan(0);
        for (const hex of linkHexes) expect(emailLinkContrast(String(hex)).readable).toBe(true);
      }
      expect(message.folderIds).toEqual([
        `demo-${String(message.provider)}-${message.direction === "outbound" ? "sent" : "inbox"}`,
      ]);
    }

    const messagesByThread = Map.groupBy(messages, (message) => String(message.messagingThreadId));
    for (const [threadIndex, thread] of threads.entries()) {
      const fixture = fixtures.threads[threadIndex];
      if (!fixture) throw new Error("Missing thread fixture");
      const ordered = (messagesByThread.get(String(thread.id)) ?? []).toSorted(
        (left, right) => (left.sentAt as Date).getTime() - (right.sentAt as Date).getTime(),
      );
      expect(ordered).toHaveLength(fixture.messages.length);
      const latest = ordered.at(-1);
      expect(latest?.sentAt).toEqual(thread.lastMessageAt);
      expect(thread.lastMessageAt).toEqual(new Date(anchor.getTime() - fixture.latestMinutesAgo * MINUTE));
      expect(String(latest?.bodyText).split(SIGNATURE_DELIMITER)[0]).toBe(thread.lastMessagePreview);
      expect(latest?.direction === "outbound").toBe(thread.lastMessageIsSender);
      const emailThread = isEmailProvider(fixture.account);
      expect(ordered.map((message) => String(message.bodyText).split(SIGNATURE_DELIMITER)[0])).toEqual(
        fixture.messages.map((message) =>
          emailThread && message.draft !== true
            ? renderEmailMarkdown(message.text, defaultEmailSettings().appearance).text
            : message.text,
        ),
      );
    }

    for (const [deletes, group] of [
      [records.accountActivityDeletes, "26000000"],
      [records.calendarEventDeletes, "25000000"],
      [records.messageDeletes, "19000000"],
      [records.participantDeletes, "18000000"],
    ] as const)
      expect(deletes).toEqual([{ where: { companyId: fixtures.companyId, id: { startsWith: `${group}-0000-` } } }]);

    expect(records.calendarDeletes).toEqual([
      { where: { companyId: fixtures.companyId, events: { none: {} }, id: { startsWith: "24000000-0000-" } } },
    ]);
    expect(records.threadDeletes).toEqual([
      {
        where: {
          companyId: fixtures.companyId,
          id: { startsWith: "17000000-0000-" },
          messages: { none: {} },
          participants: { none: {} },
        },
      },
      {
        where: {
          companyId: fixtures.companyId,
          connectedAccountId: { in: accounts.map(({ id }) => id) },
          unipileThreadId: { startsWith: "demo-fixture-thread-" },
          id: { notIn: threads.map(({ id }) => id) },
        },
      },
    ]);
    expect(records.connectedAccountDeletes).toEqual([
      {
        where: {
          companyId: fixtures.companyId,
          id: { startsWith: "16000000-0000-", notIn: accounts.map(({ id }) => id) },
        },
      },
    ]);
  });

  it("preserves inbox chronology when a persistent preview database is reseeded", async () => {
    vi.stubEnv("APP_MODE", appMode);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T10:02:00.000Z"));
    const { prisma, records } = recordingPrisma();

    await seedWorkspaceMessaging(prisma, teamFixtures);
    const accountCount = records.connectedAccounts.length;
    const firstAccountTimes = createdRows(records.connectedAccounts).map(({ createdAt, lastSyncedAt }) => ({
      createdAt,
      lastSyncedAt,
    }));
    const firstThreadTimes = createdRows(records.threads).map(({ createdAt, lastMessageAt }) => ({
      createdAt,
      lastMessageAt,
    }));
    const firstMessageTimes = createdRows(records.messages).map(({ createdAt, sentAt }) => ({ createdAt, sentAt }));
    const firstCalendarEventTimes = createdRows(records.calendarEvents).map(({ startsAt, endsAt }) => ({
      endsAt,
      startsAt,
    }));
    const firstActivityTimes = createdRows(records.accountActivities).map(({ occurredAt }) => occurredAt);
    const sentTimes = firstMessageTimes.map(({ sentAt }) => (sentAt as Date).getTime());

    expect(Math.max(...sentTimes)).toBeLessThanOrEqual(Date.now());
    expect(Math.max(...sentTimes)).toBeGreaterThan(Date.now() - 24 * 60 * MINUTE);
    expect(Math.min(...sentTimes)).toBeGreaterThan(Date.now() - 365 * 24 * 60 * MINUTE);
    expect(firstActivityTimes.every((occurredAt) => (occurredAt as Date).getTime() <= Date.now())).toBe(true);

    vi.setSystemTime(new Date("2026-07-18T12:47:00.000Z"));
    await seedWorkspaceMessaging(prisma, teamFixtures);

    expect(
      createdRows(records.connectedAccounts)
        .slice(accountCount)
        .map(({ createdAt, lastSyncedAt }) => ({ createdAt, lastSyncedAt })),
    ).toEqual(firstAccountTimes);
    expect(
      createdRows(records.threads)
        .slice(firstThreadTimes.length)
        .map(({ createdAt, lastMessageAt }) => ({ createdAt, lastMessageAt })),
    ).toEqual(firstThreadTimes);
    expect(
      createdRows(records.messages)
        .slice(firstMessageTimes.length)
        .map(({ createdAt, sentAt }) => ({ createdAt, sentAt })),
    ).toEqual(firstMessageTimes);
    expect(
      createdRows(records.calendarEvents)
        .slice(firstCalendarEventTimes.length)
        .map(({ startsAt, endsAt }) => ({ endsAt, startsAt })),
    ).toEqual(firstCalendarEventTimes);
    expect(
      createdRows(records.accountActivities)
        .slice(firstActivityTimes.length)
        .map(({ occurredAt }) => occurredAt),
    ).toEqual(firstActivityTimes);
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
    const providers = seededProviders(teamFixtures);
    const existingAccountIds = providers.map((provider) => `existing-${provider}-account`);
    const existingCalendarId = "existing-google-calendar";
    const existingThreadId = "existing-first-thread";
    upsertResultIds.connectedAccounts.push(...existingAccountIds);
    upsertResultIds.calendars.push(existingCalendarId);
    upsertResultIds.threads.push(existingThreadId);

    await seedWorkspaceMessaging(prisma, teamFixtures);

    for (const [index, call] of records.threads.entries()) {
      const connectedAccountId = `existing-${teamFixtures.threads[index]?.account}-account`;
      expect(call.create.connectedAccountId).toBe(connectedAccountId);
      expect(call.where).toEqual({
        connectedAccountId_unipileThreadId: { connectedAccountId, unipileThreadId: call.create.unipileThreadId },
      });
    }
    for (const { create } of records.calendarEvents)
      expect(create).toMatchObject({ calendarId: existingCalendarId, connectedAccountId: "existing-google-account" });
    for (const { create } of records.accountActivities)
      expect(create.connectedAccountId).toBe("existing-linkedin-account");

    const firstThread = teamFixtures.threads[0];
    if (!firstThread) throw new Error("Missing first thread fixture");
    expect(
      records.participants
        .slice(0, 1 + firstThread.participants.length)
        .every(({ create }) => create.messagingThreadId === existingThreadId),
    ).toBe(true);
    expect(
      records.messages
        .slice(0, firstThread.messages.length)
        .every(
          ({ create }) =>
            create.connectedAccountId === `existing-${firstThread.account}-account` &&
            create.messagingThreadId === existingThreadId,
        ),
    ).toBe(true);
    expect(records.threadRecordLinkEvents[0]).toBe(`delete:${existingThreadId}`);
    expect(records.threadRecordLinks.filter(({ threadId }) => threadId === existingThreadId)).toHaveLength(
      firstThread.links.length,
    );

    expect(records.connectedAccountDeletes[0]?.where.id).toEqual({
      startsWith: "16000000-0000-",
      notIn: existingAccountIds,
    });
    const staleThreads = records.threadDeletes.at(-1)?.where as {
      connectedAccountId: { in: string[] };
      id: { notIn: string[] };
    };
    expect(staleThreads.connectedAccountId.in).toEqual(existingAccountIds);
    expect(staleThreads.id.notIn[0]).toBe(existingThreadId);
    expect(staleThreads.id.notIn).not.toContain(fixtureId("17000000", 1));
  });

  it("leaves a positional thread id another row already holds out of the create", async () => {
    vi.stubEnv("APP_MODE", appMode);
    const { delegates, prisma, records } = recordingPrisma();
    const occupiedId = fixtureId("17000000", 1);
    delegates.threads.findUnique.mockImplementation((input?: FixtureRow) =>
      Promise.resolve((input?.where as FixtureRow).id === occupiedId ? { id: occupiedId } : null),
    );

    await seedWorkspaceMessaging(prisma, teamFixtures);

    expect(records.threads[0]?.create).not.toHaveProperty("id");
    expect(records.threads[1]?.create.id).toBe(fixtureId("17000000", 2));
  });

  it("rebuilds an occupied positional participant id before creating the canonical fixture", async () => {
    vi.stubEnv("APP_MODE", appMode);
    const { delegates, prisma, records } = recordingPrisma();
    const plannedId = fixtureId("18000000", 1);
    const participantRows = new Map<string, FixtureRow>([
      [
        plannedId,
        {
          companyId: teamFixtures.companyId,
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
      for (const [id, row] of participantRows)
        if (row.companyId === input.where.companyId && id.startsWith(idFilter.startsWith)) participantRows.delete(id);
      return Promise.resolve({ count: 1 });
    });
    delegates.participants.upsert.mockImplementation((input: UpsertInput) => {
      records.participants.push(input);
      participantEvents.push(`upsert:${String(input.create.id)}`);
      const naturalKey = input.where.messagingThreadId_providerUserId as FixtureRow;
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

    await expect(seedWorkspaceMessaging(prisma, teamFixtures)).resolves.toBeUndefined();

    expect(participantEvents[0]).toBe("deleteMany");
    expect(participantEvents[1]).toBe(`upsert:${plannedId}`);
    expect(participantRows.get(plannedId)).toMatchObject({
      companyId: teamFixtures.companyId,
      displayName: teamFixtures.self.name,
      providerUserId: `demo-${teamFixtures.threads[0]?.account}-self`,
    });
  });

  it("reconciles a participant the UI recreated under its natural keys", async () => {
    vi.stubEnv("APP_MODE", appMode);
    const { delegates, prisma, records } = recordingPrisma();
    const firstThread = teamFixtures.threads[0];
    const key = firstThread?.participants[0] ?? "";
    const providerUserId = `demo-${firstThread?.account}-${key}`;
    delegates.participants.findMany.mockImplementation((input?: FixtureRow) => {
      const filters = ((input?.where as FixtureRow).OR ?? []) as FixtureRow[];
      return Promise.resolve(
        filters.some((filter) => filter.providerUserId === providerUserId) ? [{ id: "ui-participant" }] : [],
      );
    });

    await seedWorkspaceMessaging(prisma, teamFixtures);

    expect(records.participantUpdates).toEqual([
      {
        where: { id: "ui-participant" },
        data: expect.objectContaining({
          companyId: teamFixtures.companyId,
          displayName: teamFixtures.people[key]?.displayName,
          isSelf: false,
          messagingThreadId: fixtureId("17000000", 1),
          providerUserId,
        }),
      },
    ]);
    expect(records.participants.some(({ create }) => create.providerUserId === providerUserId)).toBe(false);
    expect(records.participants).toHaveLength(participantCount(teamFixtures) - 1);
  });

  it("fails explicitly when two participant rows hold one attendee's keys", async () => {
    vi.stubEnv("APP_MODE", appMode);
    const { delegates, prisma, records } = recordingPrisma();
    const firstThread = teamFixtures.threads[0];
    const key = firstThread?.participants[0] ?? "";
    delegates.participants.findMany.mockImplementation((input?: FixtureRow) => {
      const filters = ((input?.where as FixtureRow).OR ?? []) as FixtureRow[];
      const matches = filters.some((filter) => filter.providerUserId === `demo-${firstThread?.account}-${key}`);
      return Promise.resolve(matches ? [{ id: "ui-by-provider-user" }, { id: "ui-by-identifier" }] : []);
    });

    await expect(seedWorkspaceMessaging(prisma, teamFixtures)).rejects.toThrow(
      `Conflicting demo participants for ${teamFixtures.people[key]?.displayName}`,
    );
    expect(records.participantUpdates).toHaveLength(0);
  });

  it("seeds only the configured accounts and skips calendar and LinkedIn activity without them", async () => {
    vi.stubEnv("APP_MODE", appMode);
    const { prisma, records } = recordingPrisma();
    const fixtures: WorkspaceMessagingFixtures = {
      ...teamFixtures,
      accounts: ["whatsapp"],
      threads: teamFixtures.threads.filter((thread) => thread.account === "whatsapp"),
    };

    await seedWorkspaceMessaging(prisma, fixtures);

    expect(createdRows(records.connectedAccounts).map(({ id, provider }) => ({ id, provider }))).toEqual([
      { id: messagingAccountId("0000", "whatsapp"), provider: "whatsapp" },
    ]);
    expect(records.calendars).toHaveLength(0);
    expect(records.calendarEvents).toHaveLength(0);
    expect(records.accountActivities).toHaveLength(0);
    expect(records.calendarDeletes).toHaveLength(1);
    expect(records.accountActivityDeletes).toHaveLength(1);
    expect(records.threads).toHaveLength(fixtures.threads.length);
    expect(records.connectedAccountDeletes).toEqual([
      {
        where: {
          companyId: fixtures.companyId,
          id: { startsWith: "16000000-0000-", notIn: [messagingAccountId("0000", "whatsapp")] },
        },
      },
    ]);
  });

  it("skips the calendar when the workspace has none", async () => {
    vi.stubEnv("APP_MODE", appMode);
    const { prisma, records } = recordingPrisma();

    await seedWorkspaceMessaging(prisma, { ...teamFixtures, calendar: null });

    expect(records.calendars).toHaveLength(0);
    expect(records.calendarEvents).toHaveLength(0);
    expect(records.connectedAccounts).toHaveLength(teamFixtures.accounts.length);
  });

  it("rejects a conversation on an account the workspace does not connect", async () => {
    vi.stubEnv("APP_MODE", appMode);
    const { prisma, records } = recordingPrisma();
    const accounts = teamFixtures.accounts.filter((provider) => provider !== "whatsapp");

    await expect(seedWorkspaceMessaging(prisma, { ...teamFixtures, accounts })).rejects.toThrow(
      "A whatsapp conversation needs a whatsapp account",
    );
    expect(records.connectedAccounts).toHaveLength(0);
  });

  it("namespaces a second workspace's ids and provider account ids by its tag", async () => {
    vi.stubEnv("APP_MODE", appMode);
    const { prisma, records } = recordingPrisma();
    const tag = germanFixtures.tag;
    expect(tag).not.toBe("0000");
    expect(germanFixtures.companyId).not.toBe(teamFixtures.companyId);

    await seedWorkspaceMessaging(prisma, teamFixtures);
    const counts = {
      accountActivities: records.accountActivities.length,
      calendarEvents: records.calendarEvents.length,
      calendars: records.calendars.length,
      connectedAccounts: records.connectedAccounts.length,
      messages: records.messages.length,
      participants: records.participants.length,
      threads: records.threads.length,
    };
    const deleteCounts = {
      connectedAccounts: records.connectedAccountDeletes.length,
      messages: records.messageDeletes.length,
      participants: records.participantDeletes.length,
      threads: records.threadDeletes.length,
    };
    await seedWorkspaceMessaging(prisma, germanFixtures);

    const groups = {
      accountActivities: "26000000",
      calendarEvents: "25000000",
      calendars: "24000000",
      connectedAccounts: "16000000",
      messages: "19000000",
      participants: "18000000",
      threads: "17000000",
    } as const;
    for (const [name, group] of Object.entries(groups) as [keyof typeof groups, string][]) {
      const team = createdRows(records[name]).slice(0, counts[name]);
      const german = createdRows(records[name]).slice(counts[name]);
      expect(german.length, name).toBeGreaterThan(0);
      for (const row of team) expect(String(row.id)).toMatch(new RegExp(`^${group}-0000-`));
      for (const [index, row] of german.entries()) {
        expect(row.companyId).toBe(germanFixtures.companyId);
        expect(String(row.id)).toMatch(new RegExp(`^${group}-${tag}-`));
        if (name !== "connectedAccounts") expect(row.id).toBe(workspaceFixtureId(group, tag, index + 1));
      }
      const teamIds = new Set(team.map(({ id }) => id));
      expect(german.filter(({ id }) => teamIds.has(id))).toEqual([]);
    }

    const germanAccounts = createdRows(records.connectedAccounts).slice(counts.connectedAccounts);
    expect(germanAccounts.map(({ provider }) => provider)).toEqual(seededProviders(germanFixtures));
    for (const account of germanAccounts) {
      const provider = account.provider as MessagingFixtureProvider;
      expect(account.unipileAccountId).toBe(`demo-fixture-${tag}-${provider}-account`);
      expect(account.unipileAccountId).toBe(messagingUnipileAccountId(tag, provider));
      expect(account.id).toBe(messagingAccountId(tag, provider));
    }
    const teamUnipileIds = new Set(
      createdRows(records.connectedAccounts)
        .slice(0, counts.connectedAccounts)
        .map(({ unipileAccountId }) => unipileAccountId),
    );
    expect(germanAccounts.filter(({ unipileAccountId }) => teamUnipileIds.has(unipileAccountId))).toEqual([]);

    const providerMessageIds = createdRows(records.messages)
      .map(({ providerMessageId }) => providerMessageId)
      .filter((value): value is string => typeof value === "string");
    expect(new Set(providerMessageIds).size).toBe(providerMessageIds.length);
    expect(
      createdRows(records.messages)
        .slice(counts.messages)
        .filter(({ providerMessageId }) => providerMessageId !== null)
        .every(({ providerMessageId }) => String(providerMessageId).startsWith(`demo-provider-message-${tag}-`)),
    ).toBe(true);

    const germanThreadIds = new Set(
      createdRows(records.threads)
        .slice(counts.threads)
        .map(({ id }) => id),
    );
    const germanLinks = records.threadRecordLinks.filter(({ threadId }) => germanThreadIds.has(threadId));
    expect(germanLinks).toHaveLength(germanFixtures.threads.reduce((count, thread) => count + thread.links.length, 0));
    expect(germanLinks.every(({ companyId }) => companyId === germanFixtures.companyId)).toBe(true);

    expect(records.messageDeletes.slice(deleteCounts.messages)).toEqual([
      { where: { companyId: germanFixtures.companyId, id: { startsWith: `19000000-${tag}-` } } },
    ]);
    expect(records.participantDeletes.slice(deleteCounts.participants)).toEqual([
      { where: { companyId: germanFixtures.companyId, id: { startsWith: `18000000-${tag}-` } } },
    ]);
    expect(records.threadDeletes.slice(deleteCounts.threads).map(({ where }) => where.companyId)).toEqual([
      germanFixtures.companyId,
      germanFixtures.companyId,
    ]);
    expect(records.connectedAccountDeletes.slice(deleteCounts.connectedAccounts)).toEqual([
      {
        where: {
          companyId: germanFixtures.companyId,
          id: { startsWith: `16000000-${tag}-`, notIn: germanAccounts.map(({ id }) => id) },
        },
      },
    ]);
  });
});
