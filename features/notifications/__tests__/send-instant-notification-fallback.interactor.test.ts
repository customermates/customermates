import { beforeEach, describe, expect, it, vi } from "vitest";

import { Locale } from "@/generated/prisma";
import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/observability/server", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

import * as ErrorReporter from "@/core/observability/server";

import {
  INSTANT_FALLBACK_MAILS_PER_TICK,
  SendInstantNotificationFallbackInteractor,
} from "../send-instant-notification-fallback.interactor";
import { FakeNotificationPauseRepo } from "./fake-notification-pause-repo";
import { FakeNotificationRepo } from "./fake-notification-repo";

const COMPANY = "00000000-0000-4000-8000-000000000011";
const ME = "00000000-0000-4000-8000-000000000010";
const COLLEAGUE = "00000000-0000-4000-8000-000000000012";
const NOW = new Date("2026-11-12T10:00:00.000Z");
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

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

describe("the fallback for instant notification mails", () => {
  let repo: FakeNotificationRepo;
  let next = 0;

  function waiting(
    userId: string,
    createdAt: Date,
    kind: "ruleAlert" | "dueToday" = "ruleAlert",
    readAt: Date | null = null,
  ) {
    next += 1;
    const row = {
      id: `row-${next}`,
      companyId: COMPANY,
      userId,
      kind,
      title: `Alert ${next}`,
      body: null,
      href: null,
      sourceRuleId: null,
      dedupeKey: null,
      readAt,
      emailedAt: null,
      createdAt,
    };
    repo.rows.push(row);
    return row;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    next = 0;
    repo = new FakeNotificationRepo();
    repo.members = [member(ME), member(COLLEAGUE)];
  });

  it("mails an instant notification that waited longer than the grace period, alone as the instant mail it should have been", async () => {
    const held = waiting(ME, minutesAgo(20));
    const fresh = waiting(ME, minutesAgo(5));
    const mail = mailer();

    const result = await new SendInstantNotificationFallbackInteractor(repo, mail).invoke(NOW);

    expect(result).toEqual({ instantNotificationFallbacks: 1 });
    expect(mail.sendInstant).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: ME }),
      expect.objectContaining({ id: held.id }),
    );
    expect(mail.sendDigest).not.toHaveBeenCalled();
    expect(repo.rows.find((row) => row.id === held.id)).toMatchObject({ emailedAt: NOW, emailedInstantly: false });
    expect(repo.rows.find((row) => row.id === fresh.id)?.emailedAt).toBeNull();
  });

  it("puts several waiting instant notifications of one member into one mail", async () => {
    waiting(ME, minutesAgo(40));
    waiting(ME, minutesAgo(30));
    waiting(COLLEAGUE, minutesAgo(20));
    const mail = mailer();

    const result = await new SendInstantNotificationFallbackInteractor(repo, mail).invoke(NOW);

    expect(result).toEqual({ instantNotificationFallbacks: 2 });
    expect(mail.sendDigest).toHaveBeenCalledTimes(1);
    expect(mail.sendDigest.mock.calls[0]?.[1]).toHaveLength(2);
    expect(mail.sendInstant).toHaveBeenCalledTimes(1);
    expect(repo.rows.every((row) => row.emailedAt !== null)).toBe(true);
  });

  it("leaves the kinds a member gets in the daily digest to the daily digest", async () => {
    waiting(ME, minutesAgo(60), "dueToday");
    repo.preferences.set(COLLEAGUE, new Map([["ruleAlert", "digest"]]));
    waiting(COLLEAGUE, minutesAgo(60));
    const mail = mailer();

    const result = await new SendInstantNotificationFallbackInteractor(repo, mail).invoke(NOW);

    expect(result).toEqual({ instantNotificationFallbacks: 0 });
    expect(mail.sendInstant).not.toHaveBeenCalled();
    expect(mail.sendDigest).not.toHaveBeenCalled();
  });

  it("gives up on a notification after 48 hours, and skips read ones and paused members", async () => {
    waiting(ME, minutesAgo(48 * 60 + 1));
    waiting(ME, minutesAgo(30), "ruleAlert", NOW);
    waiting(COLLEAGUE, minutesAgo(30));
    const pauses = new FakeNotificationPauseRepo();
    pauses.currentUserId = COLLEAGUE;
    await pauses.save({ until: new Date(NOW.getTime() + 86_400_000), timeZone: "UTC" });
    const mail = mailer();

    const result = await new SendInstantNotificationFallbackInteractor(repo, mail, Date.now, pauses).invoke(NOW);

    expect(result).toEqual({ instantNotificationFallbacks: 0 });
    expect(mail.sendInstant).not.toHaveBeenCalled();
  });

  it("sends at most a fixed number of mails per run and stops near its time budget, leaving the rest for the next run", async () => {
    const members = Array.from({ length: INSTANT_FALLBACK_MAILS_PER_TICK + 20 }, (_, index) => `member-${index}`);
    repo.members = members.map(member);
    members.forEach((id, index) => waiting(id, minutesAgo(600 - index)));
    const capped = mailer();

    await expect(new SendInstantNotificationFallbackInteractor(repo, capped).invoke(NOW)).resolves.toEqual({
      instantNotificationFallbacks: INSTANT_FALLBACK_MAILS_PER_TICK,
    });
    expect(capped.sendInstant.mock.calls[0]?.[0]).toMatchObject({ id: "member-0" });

    let elapsed = 0;
    const slow = mailer();
    slow.sendInstant.mockImplementation(() => {
      elapsed += 25_000;
      return Promise.resolve(true);
    });
    await expect(new SendInstantNotificationFallbackInteractor(repo, slow, () => elapsed).invoke(NOW)).resolves.toEqual(
      { instantNotificationFallbacks: 3 },
    );
  });

  it("goes on to the next member when one mail is refused or throws, and tries again on the next run", async () => {
    waiting(ME, minutesAgo(40));
    waiting(COLLEAGUE, minutesAgo(30));
    const mail = mailer();
    mail.sendInstant.mockRejectedValueOnce(new Error("provider down")).mockResolvedValueOnce(true);

    const first = await new SendInstantNotificationFallbackInteractor(repo, mail).invoke(NOW);
    const second = await new SendInstantNotificationFallbackInteractor(repo, mail).invoke(NOW);

    expect(first).toEqual({ instantNotificationFallbacks: 1 });
    expect(second).toEqual({ instantNotificationFallbacks: 1 });
    expect(repo.rows.every((row) => row.emailedAt !== null)).toBe(true);
    expect(ErrorReporter.captureException).toHaveBeenCalledTimes(1);
  });

  it("does nothing on a server without a mail provider", async () => {
    waiting(ME, minutesAgo(40));
    const mail = mailer(true, false);
    const lookup = vi.spyOn(repo, "findInstantFallbackUsersUnscoped");

    await expect(new SendInstantNotificationFallbackInteractor(repo, mail).invoke(NOW)).resolves.toEqual({
      instantNotificationFallbacks: 0,
    });
    expect(lookup).not.toHaveBeenCalled();
    expect(ErrorReporter.captureException).not.toHaveBeenCalled();
  });
});
