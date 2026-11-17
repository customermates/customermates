import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { Locale } from "@/generated/prisma";
import {
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
  createMockDiModule,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser({
  id: "00000000-0000-4000-8000-000000000010",
  companyId: "00000000-0000-4000-8000-000000000011",
});

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: (namespace?: string) => {
    const t = (key: string) => (namespace ? `${namespace}.${key}` : key);
    return Promise.resolve(Object.assign(t, { raw: t }));
  },
  getLocale: () => Promise.resolve("en"),
}));
vi.mock("@/core/observability/server", () => ({ captureException: vi.fn() }));

import { runWithTenant } from "@/core/decorators/tenant-context";
import { GetNotificationPreferencesInteractor } from "../get-notification-preferences.interactor";
import { GetNotificationsInteractor } from "../get-notifications.interactor";
import { MarkNotificationsReadInteractor } from "../mark-notifications-read.interactor";
import {
  DEFAULT_NOTIFICATION_EMAIL_MODES,
  NOTIFICATION_INSTANT_EMAILS_PER_HOUR,
  NOTIFICATION_KINDS,
  NotifyMembersSchema,
} from "../notification.schema";
import { NotificationService, effectiveEmailMode } from "../notification.service";
import { PruneNotificationsInteractor } from "../prune-notifications.interactor";
import { SendNotificationDigestInteractor } from "../send-notification-digest.interactor";
import { SetNotificationPauseInteractor } from "../set-notification-pause.interactor";
import { SetNotificationPreferencesInteractor } from "../set-notification-preferences.interactor";
import { FakeNotificationPauseRepo } from "./fake-notification-pause-repo";
import { FakeNotificationRepo } from "./fake-notification-repo";

const COMPANY = "00000000-0000-4000-8000-000000000011";
const ME = "00000000-0000-4000-8000-000000000010";
const COLLEAGUE = "00000000-0000-4000-8000-000000000012";
const NOW = new Date("2026-11-12T10:00:00.000Z");

function member(id: string) {
  return {
    id,
    email: `${id}@example.test`,
    firstName: "Sofia",
    displayLanguage: Locale.en,
    workspaceSlug: "ws-1",
    workspaceName: "Acme",
  };
}

function mailer(result = true, configured = true) {
  return {
    isConfigured: vi.fn().mockReturnValue(configured),
    sendInstant: vi.fn().mockResolvedValue(result),
    sendDigest: vi.fn().mockResolvedValue(result),
  };
}

const base = {
  companyId: COMPANY,
  recipients: [ME],
  kind: "ruleAlert" as const,
  title: "Look at Acme",
  href: "/records/t/r",
};

describe("notifying members", () => {
  let repo: FakeNotificationRepo;
  beforeEach(() => {
    repo = new FakeNotificationRepo();
    repo.members = [member(ME), member(COLLEAGUE)];
    repo.currentCompanyId = COMPANY;
    repo.currentUserId = ME;
    repo.clock = NOW;
  });

  it("stores one notification per member and emails instant kinds", async () => {
    const mail = mailer();
    const service = new NotificationService(repo, mail, () => NOW);
    await expect(service.notify({ ...base, recipients: [ME, COLLEAGUE, ME] })).resolves.toEqual({
      created: 2,
      emailed: 2,
    });
    expect(repo.rows.map((row) => row.userId).sort()).toEqual([ME, COLLEAGUE].sort());
    expect(mail.sendInstant).toHaveBeenCalledTimes(2);
    expect(repo.rows.every((row) => row.emailedAt?.getTime() === NOW.getTime())).toBe(true);
  });

  it("stores the notification and tries no mail on a server without a mail provider, so nothing waits for one", async () => {
    repo.preferences.set(COLLEAGUE, new Map([["ruleAlert", "digest"]]));
    const mail = mailer(true, false);
    const service = new NotificationService(repo, mail, () => NOW);

    await expect(service.notify({ ...base, recipients: [ME, COLLEAGUE] })).resolves.toEqual({ created: 2, emailed: 0 });

    expect(mail.sendInstant).not.toHaveBeenCalled();
    expect(repo.rows.map((row) => row.emailedAt?.getTime())).toEqual([NOW.getTime(), NOW.getTime()]);
    expect(repo.rows.every((row) => row.emailedInstantly !== true)).toBe(true);
    const digest = await new SendNotificationDigestInteractor(repo, mail).invoke(new Date(NOW.getTime() + 3_600_000));
    expect(digest).toEqual({ notificationDigests: 0 });
    expect(mail.sendDigest).not.toHaveBeenCalled();
  });

  it("does not email digest or switched-off kinds immediately", async () => {
    repo.preferences.set(ME, new Map([["ruleAlert", "off"]]));
    repo.preferences.set(COLLEAGUE, new Map([["ruleAlert", "digest"]]));
    const mail = mailer();
    const service = new NotificationService(repo, mail, () => NOW);
    await expect(service.notify({ ...base, recipients: [ME, COLLEAGUE] })).resolves.toEqual({ created: 2, emailed: 0 });
    expect(mail.sendInstant).not.toHaveBeenCalled();
    expect(repo.rows.find((row) => row.userId === COLLEAGUE)?.emailedAt).toBeNull();
  });

  it("holds every email of a member while their pause lasts and keeps their choices", async () => {
    const pauses = new FakeNotificationPauseRepo();
    pauses.pauses.set(ME, new Date(NOW.getTime() + 24 * 3600 * 1000));
    pauses.pauses.set(COLLEAGUE, new Date(NOW.getTime() - 1000));
    const mail = mailer();
    const service = new NotificationService(repo, mail, () => NOW, pauses);

    await expect(service.notify({ ...base, recipients: [ME, COLLEAGUE] })).resolves.toEqual({ created: 2, emailed: 1 });

    expect(mail.sendInstant).toHaveBeenCalledTimes(1);
    expect(mail.sendInstant.mock.calls[0]?.[0]).toMatchObject({ id: COLLEAGUE });
    expect(repo.rows.find((row) => row.userId === ME)?.emailedAt).toEqual(NOW);
    expect(repo.preferences.get(ME)).toBeUndefined();
  });

  it("marks a notification of a switched-off kind as handled when it is created, so the digest skips it", async () => {
    repo.preferences.set(
      ME,
      new Map([
        ["ruleAlert", "off"],
        ["dueToday", "digest"],
      ]),
    );
    const service = new NotificationService(repo, mailer(), () => NOW);

    await service.notify({ ...base, recipients: [ME, COLLEAGUE] });
    await service.notify({ ...base, kind: "dueToday", recipients: [ME] });

    const own = (kind: string) => repo.rows.find((row) => row.userId === ME && row.kind === kind);
    expect(own("ruleAlert")?.emailedAt).toEqual(NOW);
    expect(own("dueToday")?.emailedAt).toBeNull();
    expect(repo.rows.find((row) => row.userId === COLLEAGUE)?.emailedAt).toEqual(NOW);
    const page = await repo.findDigestUsersUnscoped({ since: new Date(0), limit: 10, after: null });
    expect(page.users).toEqual([{ companyId: COMPANY, userId: ME }]);
  });

  it("does not count notifications of switched-off or digest kinds against the instant cap", async () => {
    repo.preferences.set(ME, new Map([["dueToday", "off"]]));
    const mail = mailer();
    const service = new NotificationService(repo, mail, () => NOW);
    for (let index = 0; index < 30; index += 1)
      await service.notify({ ...base, kind: "dueToday", title: `Due ${index}`, recipients: [ME] });
    expect(repo.rows.every((row) => row.emailedAt?.getTime() === NOW.getTime())).toBe(true);

    await expect(service.notify({ ...base, recipients: [ME] })).resolves.toEqual({ created: 1, emailed: 1 });
  });

  it("emails at most twenty instant notifications per member per rolling hour and leaves the rest unemailed", async () => {
    const mail = mailer();
    const service = new NotificationService(repo, mail, () => NOW);
    let emailed = 0;
    for (let index = 0; index < NOTIFICATION_INSTANT_EMAILS_PER_HOUR + 5; index += 1)
      emailed += (await service.notify({ ...base, title: `Alert ${index}`, recipients: [ME] })).emailed;

    expect(emailed).toBe(NOTIFICATION_INSTANT_EMAILS_PER_HOUR);
    expect(mail.sendInstant).toHaveBeenCalledTimes(NOTIFICATION_INSTANT_EMAILS_PER_HOUR);
    const held = repo.rows.filter((row) => row.emailedAt === null);
    expect(held).toHaveLength(5);
    expect(held.every((row) => row.readAt === null)).toBe(true);

    await expect(service.notify({ ...base, recipients: [COLLEAGUE] })).resolves.toEqual({ created: 1, emailed: 1 });
  });

  it("applies the cap inside one batch and counts only mails sent in the last hour", async () => {
    const mail = mailer();
    const stale = new Date(NOW.getTime() - 61 * 60 * 1000);
    const recent = new Date(NOW.getTime() - 59 * 60 * 1000);
    const emailedEarlier = (at: Date, index: number) => ({
      id: `earlier-${at.getTime()}-${index}`,
      companyId: COMPANY,
      userId: ME,
      kind: base.kind,
      title: base.title,
      body: null,
      href: base.href,
      sourceRuleId: null,
      dedupeKey: null,
      readAt: null,
      emailedAt: at,
      emailedInstantly: true,
      createdAt: at,
    });
    repo.rows.push(
      ...Array.from({ length: NOTIFICATION_INSTANT_EMAILS_PER_HOUR - 1 }, (_, index) => emailedEarlier(recent, index)),
      ...Array.from({ length: 30 }, (_, index) => emailedEarlier(stale, index)),
    );
    const service = new NotificationService(repo, mail, () => NOW);

    await expect(service.notify({ ...base, recipients: [ME] })).resolves.toEqual({ created: 1, emailed: 1 });
    await expect(service.notify({ ...base, title: "One more", recipients: [ME] })).resolves.toEqual({
      created: 1,
      emailed: 0,
    });
    expect(mail.sendInstant).toHaveBeenCalledTimes(1);
  });

  it("counts instant mails that went out, not rows a digest or a pause marked as handled", async () => {
    const recent = new Date(NOW.getTime() - 10 * 60 * 1000);
    const handled = (index: number, emailedInstantly: boolean) => ({
      id: `handled-${emailedInstantly}-${index}`,
      companyId: COMPANY,
      userId: ME,
      kind: base.kind,
      title: base.title,
      body: null,
      href: base.href,
      sourceRuleId: null,
      dedupeKey: null,
      readAt: null,
      emailedAt: recent,
      emailedInstantly,
      createdAt: recent,
    });
    repo.rows.push(...Array.from({ length: 40 }, (_, index) => handled(index, false)));
    const pauses = new FakeNotificationPauseRepo();
    pauses.pauses.set(ME, new Date(NOW.getTime() + 60 * 1000));
    const mail = mailer();
    const paused = new NotificationService(repo, mail, () => NOW, pauses);
    for (let index = 0; index < 25; index += 1)
      await paused.notify({ ...base, title: `Held ${index}`, recipients: [ME] });
    expect(mail.sendInstant).not.toHaveBeenCalled();

    const afterPause = new NotificationService(repo, mail, () => new Date(NOW.getTime() + 2 * 60 * 1000), pauses);
    await expect(afterPause.notify({ ...base, title: "After the pause", recipients: [ME] })).resolves.toEqual({
      created: 1,
      emailed: 1,
    });
    expect(repo.rows.filter((row) => row.emailedInstantly).map((row) => row.title)).toEqual(["After the pause"]);
  });

  it("marks each instant mail as sent before the next recipient is mailed", async () => {
    const mail = mailer();
    const markedAtSend: number[] = [];
    mail.sendInstant.mockImplementation(() => {
      markedAtSend.push(repo.rows.filter((row) => row.emailedAt !== null).length);
      return Promise.resolve(true);
    });
    const service = new NotificationService(repo, mail, () => NOW);

    await service.notify({ ...base, recipients: [ME, COLLEAGUE] });

    expect(markedAtSend).toEqual([0, 1]);
  });

  it("keeps mailing the other recipients when marking one mail fails", async () => {
    const mail = mailer();
    const service = new NotificationService(repo, mail, () => NOW);
    repo.markEmailedFailure = new Error("connection lost");

    await expect(service.notify({ ...base, recipients: [ME, COLLEAGUE] })).resolves.toEqual({
      created: 2,
      emailed: 2,
    });
    expect(mail.sendInstant).toHaveBeenCalledTimes(2);
  });

  it("does not spend the cap on mails that fail to send", async () => {
    const failing = mailer();
    failing.sendInstant.mockRejectedValue(new Error("smtp down"));
    const service = new NotificationService(repo, failing, () => NOW);
    for (let index = 0; index < NOTIFICATION_INSTANT_EMAILS_PER_HOUR + 1; index += 1)
      await service.notify({ ...base, title: `Alert ${index}`, recipients: [ME] });

    expect(failing.sendInstant).toHaveBeenCalledTimes(NOTIFICATION_INSTANT_EMAILS_PER_HOUR + 1);
    expect(repo.rows.every((row) => row.emailedAt === null)).toBe(true);
  });

  it("defaults each kind to its documented email mode", () => {
    expect(effectiveEmailMode(undefined, "ruleAlert")).toBe("instant");
    expect(effectiveEmailMode(undefined, "dueToday")).toBe("digest");
    expect(effectiveEmailMode(undefined, "replyReceived")).toBe("digest");
    expect(effectiveEmailMode(new Map([["dueToday", "instant"]]), "dueToday")).toBe("instant");
    expect(Object.keys(DEFAULT_NOTIFICATION_EMAIL_MODES).sort()).toEqual([...NOTIFICATION_KINDS].sort());
  });

  it("refuses to create a kind that nothing produces", async () => {
    const service = new NotificationService(repo, mailer(), () => NOW);
    await expect(service.notify({ ...base, kind: "assigned" } as never)).rejects.toThrow();
    await expect(service.notify({ ...base, kind: "formSubmission" } as never)).rejects.toThrow();
  });

  it("creates a notification once for the same dedupe key and keeps going when the mail fails", async () => {
    const failing = mailer();
    failing.sendInstant.mockRejectedValue(new Error("smtp down"));
    const service = new NotificationService(repo, failing, () => NOW);
    const input = { ...base, dedupeKey: "rule:run:0" };
    await expect(service.notify(input)).resolves.toEqual({ created: 1, emailed: 0 });
    await expect(service.notify(input)).resolves.toEqual({ created: 0, emailed: 0 });
    expect(repo.rows).toHaveLength(1);
  });

  it("ignores recipients who are not active members and validates its input", async () => {
    const service = new NotificationService(repo, mailer(), () => NOW);
    await expect(service.notify({ ...base, recipients: ["00000000-0000-4000-8000-0000000000ff"] })).resolves.toEqual({
      created: 0,
      emailed: 0,
    });
    await expect(service.notify({ ...base, recipients: [] })).rejects.toThrow();
    expect(NotifyMembersSchema.safeParse({ ...base, href: "https://evil.example" }).success).toBe(false);
    expect(NotifyMembersSchema.safeParse({ ...base, href: "//evil.example" }).success).toBe(false);
    expect(NotifyMembersSchema.safeParse({ ...base, title: "   " }).success).toBe(false);
  });
});

describe("the inbox", () => {
  let repo: FakeNotificationRepo;
  beforeEach(async () => {
    repo = new FakeNotificationRepo();
    repo.members = [member(ME), member(COLLEAGUE)];
    repo.currentCompanyId = COMPANY;
    repo.currentUserId = ME;
    for (const [index, recipient] of [ME, ME, ME, COLLEAGUE].entries()) {
      repo.clock = new Date(NOW.getTime() + index * 1000);
      await new NotificationService(repo, mailer(), () => NOW).notify({
        ...base,
        recipients: [recipient],
        title: `Note ${index}`,
        kind: "ruleAlert",
      });
    }
  });

  const asMe = <T>(fn: () => Promise<T>) => runWithTenant(mockUser, fn);

  it("shows the newest first with the unread count of the caller only", async () => {
    const inbox = new GetNotificationsInteractor(repo);
    const result = await asMe(() => inbox.invoke({ limit: 2 } as never));
    expect(result).toMatchObject({ ok: true, data: { unreadCount: 3 } });
    if (!result.ok) return;
    expect(result.data.items.map((item) => item.title)).toEqual(["Note 2", "Note 1"]);
    expect(result.data.nextBefore).toBe(`${result.data.items[1]?.createdAt}_${result.data.items[1]?.id}`);
    const next = await asMe(() => inbox.invoke({ limit: 2, before: result.data.nextBefore } as never));
    if (!next.ok) throw new Error("expected a page");
    expect(next.data.items.map((item) => item.title)).toEqual(["Note 0"]);
    expect(next.data.nextBefore).toBeNull();
  });

  it("pages through notifications created in the same millisecond without skipping one", async () => {
    for (const row of repo.rows) row.createdAt = NOW;
    const inbox = new GetNotificationsInteractor(repo);
    const seen: string[] = [];
    let before: string | null | undefined;
    do {
      const page = await asMe(() => inbox.invoke({ limit: 1, ...(before ? { before } : {}) } as never));
      if (!page.ok) throw new Error("expected a page");
      seen.push(...page.data.items.map((item) => item.id));
      before = page.data.nextBefore;
    } while (before);

    expect(seen.sort()).toEqual(
      repo.rows
        .filter((row) => row.userId === ME)
        .map((row) => row.id)
        .sort(),
    );
  });

  it("still reads a plain timestamp as the page boundary", async () => {
    const inbox = new GetNotificationsInteractor(repo);
    const page = await asMe(() =>
      inbox.invoke({ limit: 5, before: new Date(NOW.getTime() + 1500).toISOString() } as never),
    );
    if (!page.ok) throw new Error("expected a page");
    expect(page.data.items.map((item) => item.title)).toEqual(["Note 1", "Note 0"]);
  });

  it("marks chosen notifications or all of them as read, only for the caller", async () => {
    const mark = new MarkNotificationsReadInteractor(repo, () => NOW);
    const [first] = repo.rows;
    await expect(asMe(() => mark.invoke({ ids: [first?.id] } as never))).resolves.toEqual({
      ok: true,
      data: { marked: 1 },
    });
    const colleagueRow = repo.rows.find((row) => row.userId === COLLEAGUE);
    await expect(asMe(() => mark.invoke({ ids: [colleagueRow?.id] } as never))).resolves.toEqual({
      ok: true,
      data: { marked: 0 },
    });
    await expect(asMe(() => mark.invoke({ all: true } as never))).resolves.toEqual({ ok: true, data: { marked: 2 } });
    const inbox = new GetNotificationsInteractor(repo);
    await expect(asMe(() => inbox.invoke({ unreadOnly: true } as never))).resolves.toMatchObject({
      ok: true,
      data: { items: [], unreadCount: 0 },
    });
    expect((await asMe(() => mark.invoke({} as never))).ok).toBe(false);
    expect((await asMe(() => mark.invoke({ ids: [first?.id], all: true } as never))).ok).toBe(false);
  });

  it("returns every kind with its effective mode and saves changes", async () => {
    const pauses = new FakeNotificationPauseRepo();
    pauses.currentUserId = ME;
    const read = new GetNotificationPreferencesInteractor(repo, pauses, () => NOW);
    const write = new SetNotificationPreferencesInteractor(repo, pauses, () => NOW);
    const before = await asMe(() => read.invoke());
    expect(before).toMatchObject({ ok: true, data: { pausedUntil: null, emailConfigured: true } });
    const withoutMail = { isConfigured: () => false };
    const unconfigured = await asMe(() =>
      new GetNotificationPreferencesInteractor(repo, pauses, () => NOW, withoutMail).invoke(),
    );
    expect(unconfigured).toMatchObject({ ok: true, data: { emailConfigured: false } });
    if (!before.ok) return;
    expect(before.data.preferences.map((item) => item.kind)).toEqual(NOTIFICATION_KINDS);
    expect(before.data.preferences.find((item) => item.kind === "dueToday")?.emailMode).toBe("digest");
    const after = await asMe(() =>
      write.invoke({
        preferences: [
          { kind: "dueToday", emailMode: "off" },
          { kind: "replyReceived", emailMode: "instant" },
        ],
      } as never),
    );
    if (!after.ok) throw new Error("expected preferences");
    expect(after.data.preferences.find((item) => item.kind === "dueToday")?.emailMode).toBe("off");
    expect(after.data.preferences.find((item) => item.kind === "replyReceived")?.emailMode).toBe("instant");
    expect(after.data.preferences.find((item) => item.kind === "ruleAlert")?.emailMode).toBe("instant");
    expect(repo.preferences.get(COLLEAGUE)).toBeUndefined();
  });

  it("pauses every email until a day in the future, reports the day and ends the pause again", async () => {
    const pauses = new FakeNotificationPauseRepo();
    pauses.currentUserId = ME;
    const pause = new SetNotificationPauseInteractor(repo, pauses, () => NOW);
    const read = new GetNotificationPreferencesInteractor(repo, pauses, () => NOW);

    const on = await asMe(() => pause.invoke({ until: "2026-11-19", timeZone: "UTC" }));
    expect(on).toMatchObject({ ok: true, data: { pausedUntil: "2026-11-19" } });
    expect(pauses.pauses.get(ME)).toEqual(new Date("2026-11-19T00:00:00.000Z"));
    expect(await asMe(() => read.invoke())).toMatchObject({ ok: true, data: { pausedUntil: "2026-11-19" } });

    const off = await asMe(() => pause.invoke({ until: null, timeZone: "UTC" }));
    expect(off).toMatchObject({ ok: true, data: { pausedUntil: null } });
    expect(pauses.pauses.has(ME)).toBe(false);
  });

  it("ends the pause when the chosen day begins where the member is, and reports that day back", async () => {
    const pauses = new FakeNotificationPauseRepo();
    pauses.currentUserId = ME;
    const pause = new SetNotificationPauseInteractor(repo, pauses, () => NOW);
    const read = new GetNotificationPreferencesInteractor(repo, pauses, () => NOW);

    const newYork = await asMe(() => pause.invoke({ until: "2026-11-16", timeZone: "America/New_York" }));
    expect(newYork).toMatchObject({ ok: true, data: { pausedUntil: "2026-11-16" } });
    expect(pauses.pauses.get(ME)).toEqual(new Date("2026-11-16T05:00:00.000Z"));

    const berlin = await asMe(() => pause.invoke({ until: "2026-11-16", timeZone: "Europe/Berlin" }));
    expect(berlin).toMatchObject({ ok: true, data: { pausedUntil: "2026-11-16" } });
    expect(pauses.pauses.get(ME)).toEqual(new Date("2026-11-15T23:00:00.000Z"));
    expect(await asMe(() => read.invoke())).toMatchObject({ ok: true, data: { pausedUntil: "2026-11-16" } });
  });

  it("accepts tomorrow from a member west of UTC whose evening is already the next UTC day", async () => {
    const pauses = new FakeNotificationPauseRepo();
    pauses.currentUserId = ME;
    const evening = new Date("2026-11-13T02:30:00.000Z");
    const pause = new SetNotificationPauseInteractor(repo, pauses, () => evening);

    const tomorrow = await asMe(() => pause.invoke({ until: "2026-11-13", timeZone: "America/Los_Angeles" }));
    expect(tomorrow).toMatchObject({ ok: true, data: { pausedUntil: "2026-11-13" } });
    expect(pauses.pauses.get(ME)).toEqual(new Date("2026-11-13T08:00:00.000Z"));

    const today = await asMe(() => pause.invoke({ until: "2026-11-12", timeZone: "America/Los_Angeles" }));
    expect(today.ok).toBe(false);
  });

  it("refuses a pause that ends today or earlier, more than a year out, on no real day or in no real zone", async () => {
    const pauses = new FakeNotificationPauseRepo();
    pauses.currentUserId = ME;
    const pause = new SetNotificationPauseInteractor(repo, pauses, () => NOW);

    for (const until of ["2026-11-12", "2026-11-01", "2027-11-13", "2026-02-30", "nonsense"]) {
      const result = await asMe(() => pause.invoke({ until, timeZone: "UTC" }));
      expect(result.ok, until).toBe(false);
    }
    expect((await asMe(() => pause.invoke({ until: "2026-11-19", timeZone: "Mars/Olympus" }))).ok).toBe(false);
    expect(pauses.pauses.has(ME)).toBe(false);
  });

  it("reports an expired pause as no pause", async () => {
    const pauses = new FakeNotificationPauseRepo();
    pauses.currentUserId = ME;
    pauses.pauses.set(ME, new Date("2026-11-12T00:00:00.000Z"));
    const read = new GetNotificationPreferencesInteractor(repo, pauses, () => NOW);

    expect(await asMe(() => read.invoke())).toMatchObject({ ok: true, data: { pausedUntil: null } });
  });
});

describe("the daily digest", () => {
  let repo: FakeNotificationRepo;
  beforeEach(() => {
    repo = new FakeNotificationRepo();
    repo.members = [member(ME), member(COLLEAGUE)];
    repo.currentCompanyId = COMPANY;
    repo.currentUserId = ME;
    repo.clock = NOW;
  });

  async function seed(kind: "dueToday" | "ruleAlert", recipient: string, ageHours = 1) {
    repo.clock = new Date(NOW.getTime() - ageHours * 3600 * 1000);
    await new NotificationService(repo, mailer(false), () => NOW).notify({ ...base, kind, recipients: [recipient] });
  }

  it("sends one mail per member with their digest notifications, then marks them emailed", async () => {
    await seed("dueToday", ME);
    await seed("dueToday", ME);
    await seed("dueToday", COLLEAGUE);
    repo.preferences.set(COLLEAGUE, new Map([["dueToday", "off"]]));
    const mail = mailer();
    const digest = new SendNotificationDigestInteractor(repo, mail);
    await expect(digest.invoke(NOW)).resolves.toEqual({ notificationDigests: 1 });
    expect(mail.sendDigest).toHaveBeenCalledTimes(1);
    expect(mail.sendDigest.mock.calls[0]?.[1]).toHaveLength(2);
    expect(repo.rows.filter((row) => row.emailedAt).length).toBe(2);
    await expect(digest.invoke(NOW)).resolves.toEqual({ notificationDigests: 0 });
  });

  it("sends no digest to a paused member and leaves their notifications for after the pause", async () => {
    await seed("dueToday", ME);
    await seed("dueToday", COLLEAGUE);
    const pauses = new FakeNotificationPauseRepo();
    pauses.pauses.set(ME, new Date(NOW.getTime() + 3600 * 1000));
    const mail = mailer();
    const digest = new SendNotificationDigestInteractor(repo, mail, Date.now, pauses);

    await expect(digest.invoke(NOW)).resolves.toEqual({ notificationDigests: 1 });

    expect(mail.sendDigest.mock.calls[0]?.[0]).toMatchObject({ id: COLLEAGUE });
    expect(repo.rows.find((row) => row.userId === ME)?.emailedAt).toBeNull();
  });

  it("takes instant notifications the cap or a failed mail held back into the next digest once they are older than the grace period", async () => {
    await seed("ruleAlert", ME, 1);
    repo.clock = new Date(NOW.getTime() - 60 * 1000);
    await new NotificationService(repo, mailer(false), () => NOW).notify({
      ...base,
      title: "Just now",
      recipients: [ME],
    });
    const mail = mailer();

    await expect(new SendNotificationDigestInteractor(repo, mail).invoke(NOW)).resolves.toEqual({
      notificationDigests: 1,
    });

    expect(mail.sendDigest.mock.calls[0]?.[1]).toHaveLength(1);
    expect(repo.rows.map((row) => row.emailedAt !== null)).toEqual([true, false]);
  });

  function unsentRow(userId: string, createdAt: Date, index: number) {
    return {
      id: `row-${userId}-${index}`,
      companyId: COMPANY,
      userId,
      kind: "dueToday" as const,
      title: "Due",
      body: null,
      href: null,
      sourceRuleId: null,
      dedupeKey: null,
      readAt: null,
      emailedAt: null,
      createdAt,
    };
  }

  it("sends the digest of a member whose oldest waiting notifications are of a kind they switched off", async () => {
    const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60 * 1000);
    repo.rows.push(
      ...Array.from({ length: 130 }, (_, index) => ({
        ...unsentRow(ME, minutesAgo(600 - index), index),
        kind: "ruleAlert" as const,
      })),
      { ...unsentRow(ME, minutesAgo(30), 900), title: "Call Sofia" },
    );
    repo.preferences.set(ME, new Map([["ruleAlert", "off"]]));
    const mail = mailer();

    await expect(new SendNotificationDigestInteractor(repo, mail).invoke(NOW)).resolves.toEqual({
      notificationDigests: 1,
    });

    expect(mail.sendDigest.mock.calls[0]?.[1].map((item: { title: string }) => item.title)).toEqual(["Call Sofia"]);
    expect(repo.rows.filter((row) => row.emailedAt !== null).map((row) => row.title)).toEqual(["Call Sofia"]);
  });

  it("goes on to the next member when marking one digest as sent fails", async () => {
    repo.rows.push(
      unsentRow(COLLEAGUE, new Date(NOW.getTime() - 3 * 3600 * 1000), 0),
      unsentRow(ME, new Date(NOW.getTime() - 2 * 3600 * 1000), 0),
    );
    const mail = mailer();
    mail.sendDigest.mockImplementation((recipient: { id: string }) => {
      repo.markEmailedFailure = recipient.id === COLLEAGUE ? new Error("connection lost") : null;
      return Promise.resolve(true);
    });

    await expect(new SendNotificationDigestInteractor(repo, mail).invoke(NOW)).resolves.toEqual({
      notificationDigests: 1,
    });

    expect(mail.sendDigest.mock.calls.map((call) => call[0].id)).toEqual([COLLEAGUE, ME]);
    expect(repo.rows.find((row) => row.userId === ME)?.emailedAt).toEqual(NOW);
  });

  it("still reaches a member beyond the first page of users who cannot be mailed", async () => {
    const earlier = (minutes: number) => new Date(NOW.getTime() - (90 - minutes) * 60 * 1000);
    const unmailable = Array.from(
      { length: 501 },
      (_, index) => `00000000-0000-4000-8001-${String(index).padStart(12, "0")}`,
    );
    repo.members = [member(ME), ...unmailable.map(member)];
    repo.preferences = new Map(unmailable.map((userId) => [userId, new Map([["dueToday", "off"]])]));
    repo.rows.push(...unmailable.map((userId, index) => unsentRow(userId, earlier(index / 10), 0)));
    repo.rows.push(unsentRow(ME, earlier(80), 0));
    const mail = mailer();

    await expect(new SendNotificationDigestInteractor(repo, mail).invoke(NOW)).resolves.toEqual({
      notificationDigests: 1,
    });

    expect(mail.sendDigest).toHaveBeenCalledTimes(1);
    expect(mail.sendDigest.mock.calls[0]?.[0]).toMatchObject({ id: ME });
    expect(repo.rows.find((row) => row.userId === ME)?.emailedAt).toEqual(NOW);
  });

  it("serves the member waiting longest first and stops near the time budget, leaving the rest for the next run", async () => {
    repo.members = [member(ME), member(COLLEAGUE)];
    repo.rows.push(
      unsentRow(COLLEAGUE, new Date(NOW.getTime() - 3 * 3600 * 1000), 0),
      unsentRow(ME, new Date(NOW.getTime() - 2 * 3600 * 1000), 0),
    );
    let elapsed = 0;
    const mail = mailer();
    mail.sendDigest.mockImplementation(() => {
      elapsed += 250_000;
      return Promise.resolve(true);
    });
    const digest = new SendNotificationDigestInteractor(repo, mail, () => elapsed);

    await expect(digest.invoke(NOW)).resolves.toEqual({ notificationDigests: 1 });
    expect(mail.sendDigest.mock.calls.map((call) => call[0].id)).toEqual([COLLEAGUE]);
    expect(repo.rows.find((row) => row.userId === ME)?.emailedAt).toBeNull();

    elapsed = 0;
    await expect(digest.invoke(NOW)).resolves.toEqual({ notificationDigests: 1 });
    expect(mail.sendDigest.mock.calls.map((call) => call[0].id)).toEqual([COLLEAGUE, ME]);
  });

  it("leaves notifications unsent when the mail cannot be delivered, and skips read ones", async () => {
    await seed("dueToday", ME);
    await seed("dueToday", ME);
    repo.rows[0].readAt = NOW;
    const refusing = mailer(false);
    const digest = new SendNotificationDigestInteractor(repo, refusing);
    await expect(digest.invoke(NOW)).resolves.toMatchObject({ notificationDigests: 0 });
    expect(repo.rows.every((row) => row.emailedAt === null)).toBe(true);
    expect(refusing.sendDigest.mock.calls[0]?.[1]).toHaveLength(1);
    const throwing = mailer();
    throwing.sendDigest.mockRejectedValue(new Error("down"));
    await expect(new SendNotificationDigestInteractor(repo, throwing).invoke(NOW)).resolves.toMatchObject({
      notificationDigests: 0,
    });
  });

  it("prunes notifications older than ninety days, apart from the digest", async () => {
    await seed("dueToday", ME, 91 * 24);
    await seed("ruleAlert", ME, 1);
    await expect(new PruneNotificationsInteractor(repo).invoke({ now: NOW })).resolves.toEqual({ pruned: 1 });
    expect(repo.rows).toHaveLength(1);
    await expect(new PruneNotificationsInteractor(repo).invoke({ now: NOW })).resolves.toEqual({ pruned: 0 });
  });
});
