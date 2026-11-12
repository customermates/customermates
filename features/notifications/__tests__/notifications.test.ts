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
import { DEFAULT_NOTIFICATION_EMAIL_MODES, NotifyMembersSchema } from "../notification.schema";
import { NotificationService, effectiveEmailMode } from "../notification.service";
import { SendNotificationDigestInteractor } from "../send-notification-digest.interactor";
import { SetNotificationPreferencesInteractor } from "../set-notification-preferences.interactor";
import { FakeNotificationRepo } from "./fake-notification-repo";

const COMPANY = "00000000-0000-4000-8000-000000000011";
const ME = "00000000-0000-4000-8000-000000000010";
const COLLEAGUE = "00000000-0000-4000-8000-000000000012";
const NOW = new Date("2026-11-12T10:00:00.000Z");

function member(id: string) {
  return { id, email: `${id}@example.test`, firstName: "Sofia", displayLanguage: Locale.en, workspaceSlug: "ws-1" };
}

function mailer(result = true) {
  return {
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

  it("does not email digest or switched-off kinds immediately", async () => {
    repo.preferences.set(ME, new Map([["ruleAlert", "off"]]));
    repo.preferences.set(COLLEAGUE, new Map([["ruleAlert", "digest"]]));
    const mail = mailer();
    const service = new NotificationService(repo, mail, () => NOW);
    await expect(service.notify({ ...base, recipients: [ME, COLLEAGUE] })).resolves.toEqual({ created: 2, emailed: 0 });
    expect(mail.sendInstant).not.toHaveBeenCalled();
    expect(repo.rows.every((row) => row.emailedAt === null)).toBe(true);
  });

  it("defaults each kind to its documented email mode", () => {
    expect(effectiveEmailMode(undefined, "assigned")).toBe("instant");
    expect(effectiveEmailMode(undefined, "dueToday")).toBe("digest");
    expect(effectiveEmailMode(undefined, "replyReceived")).toBe("digest");
    expect(effectiveEmailMode(new Map([["dueToday", "instant"]]), "dueToday")).toBe("instant");
    expect(DEFAULT_NOTIFICATION_EMAIL_MODES.formSubmission).toBe("instant");
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
        kind: "assigned",
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
    expect(result.data.nextBefore).toBe(result.data.items[1]?.createdAt);
    const next = await asMe(() => inbox.invoke({ limit: 2, before: result.data.nextBefore } as never));
    if (!next.ok) throw new Error("expected a page");
    expect(next.data.items.map((item) => item.title)).toEqual(["Note 0"]);
    expect(next.data.nextBefore).toBeNull();
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
    const read = new GetNotificationPreferencesInteractor(repo);
    const write = new SetNotificationPreferencesInteractor(repo);
    const before = await asMe(() => read.invoke());
    expect(before).toMatchObject({ ok: true });
    if (!before.ok) return;
    expect(before.data.preferences).toHaveLength(5);
    expect(before.data.preferences.find((item) => item.kind === "dueToday")?.emailMode).toBe("digest");
    const after = await asMe(() =>
      write.invoke({
        preferences: [
          { kind: "dueToday", emailMode: "off" },
          { kind: "assigned", emailMode: "digest" },
        ],
      } as never),
    );
    if (!after.ok) throw new Error("expected preferences");
    expect(after.data.preferences.find((item) => item.kind === "dueToday")?.emailMode).toBe("off");
    expect(after.data.preferences.find((item) => item.kind === "assigned")?.emailMode).toBe("digest");
    expect(after.data.preferences.find((item) => item.kind === "ruleAlert")?.emailMode).toBe("instant");
    expect(repo.preferences.get(COLLEAGUE)).toBeUndefined();
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
    await seed("ruleAlert", ME);
    await seed("dueToday", COLLEAGUE);
    repo.preferences.set(COLLEAGUE, new Map([["dueToday", "off"]]));
    const mail = mailer();
    const digest = new SendNotificationDigestInteractor(repo, mail);
    await expect(digest.invoke(NOW)).resolves.toEqual({ notificationDigests: 1, notificationsPruned: 0 });
    expect(mail.sendDigest).toHaveBeenCalledTimes(1);
    expect(mail.sendDigest.mock.calls[0]?.[1]).toHaveLength(2);
    expect(repo.rows.filter((row) => row.emailedAt).length).toBe(2);
    await expect(digest.invoke(NOW)).resolves.toEqual({ notificationDigests: 0, notificationsPruned: 0 });
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

  it("prunes notifications older than ninety days", async () => {
    await seed("dueToday", ME, 91 * 24);
    await seed("ruleAlert", ME, 1);
    const digest = new SendNotificationDigestInteractor(repo, mailer(false));
    await expect(digest.invoke(NOW)).resolves.toMatchObject({ notificationsPruned: 1 });
    expect(repo.rows).toHaveLength(1);
  });
});
