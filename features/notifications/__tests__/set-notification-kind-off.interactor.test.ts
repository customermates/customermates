import { beforeEach, describe, expect, it, vi } from "vitest";

import { Locale } from "@/generated/prisma";
import { MOCK_ENV_MODULE, MOCK_PRISMA_DB_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { SetNotificationKindOffInteractor } from "../set-notification-kind-off.interactor";
import { notificationUnsubscribeSecret, signNotificationUnsubscribe } from "../notification-unsubscribe-token";
import { FakeNotificationRepo } from "./fake-notification-repo";

const COMPANY = "00000000-0000-4000-8000-000000000011";
const ME = "00000000-0000-4000-8000-000000000010";
const NOW = new Date("2026-11-17T08:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const AUTH_SECRET = "auth-secret";
const SECRET = notificationUnsubscribeSecret(AUTH_SECRET) as string;

function signed(kind: "dueToday" | "replyReceived" | "ruleAlert" = "ruleAlert") {
  return signNotificationUnsubscribe(SECRET, { userId: ME, companyId: COMPANY, kind }, NOW);
}

let repo: FakeNotificationRepo;
let clockNow = NOW;

function interactor(authSecret: string | undefined = AUTH_SECRET) {
  return new SetNotificationKindOffInteractor(repo, authSecret, () => clockNow);
}

beforeEach(() => {
  repo = new FakeNotificationRepo();
  clockNow = NOW;
  repo.members = [
    { id: ME, email: "me@example.test", firstName: "Sofia", displayLanguage: Locale.de, workspaceSlug: "ws-1" },
  ];
});

describe("turning a notification kind off from an email link", () => {
  it("changes nothing until the person confirms, and names the kind and the workspace to ask about", async () => {
    const token = signed("ruleAlert");

    const first = await interactor().invoke({ token, confirmed: false });
    const second = await interactor().invoke({ token, confirmed: false });

    expect(first).toEqual({
      ok: true,
      data: { status: "pending", kind: "ruleAlert", workspaceSlug: "ws-1", locale: "de" },
    });
    expect(second).toEqual(first);
    expect(repo.unscopedSaves).toEqual([]);
    expect(repo.preferences.get(ME)?.get("ruleAlert")).toBeUndefined();
  });

  it("sets the email mode of that kind to off without a session and names where to send the person next", async () => {
    const result = await interactor().invoke({ token: signed("ruleAlert"), confirmed: true });

    expect(result).toEqual({
      ok: true,
      data: { status: "off", kind: "ruleAlert", workspaceSlug: "ws-1", locale: "de" },
    });
    expect(repo.unscopedSaves).toEqual([{ companyId: COMPANY, userId: ME, kind: "ruleAlert", emailMode: "off" }]);
    expect(repo.preferences.get(ME)?.get("ruleAlert")).toBe("off");
  });

  it("leaves the other kinds as they were", async () => {
    repo.preferences.set(ME, new Map([["dueToday", "instant"]]));

    await interactor().invoke({ token: signed("replyReceived"), confirmed: true });

    expect(repo.preferences.get(ME)?.get("dueToday")).toBe("instant");
    expect(repo.preferences.get(ME)?.get("replyReceived")).toBe("off");
  });

  it("is idempotent when the link is followed again", async () => {
    const token = signed("dueToday");

    const first = await interactor().invoke({ token, confirmed: true });
    const second = await interactor().invoke({ token, confirmed: true });

    expect(second).toEqual(first);
    expect(repo.preferences.get(ME)?.get("dueToday")).toBe("off");
  });

  it("changes nothing for a wrong, tampered or empty token", async () => {
    const token = signed("ruleAlert");
    const tampered = token.replace("ruleAlert", "dueToday");

    expect(await interactor().invoke({ token: tampered, confirmed: true })).toEqual({
      ok: true,
      data: { status: "invalid" },
    });
    expect(await interactor().invoke({ token: "nonsense", confirmed: true })).toEqual({
      ok: true,
      data: { status: "invalid" },
    });
    expect((await interactor().invoke({ token: "", confirmed: true })).ok).toBe(false);
    expect(repo.unscopedSaves).toEqual([]);
  });

  it("refuses a token signed with another secret and any token when no secret is configured", async () => {
    const token = signed("ruleAlert");

    expect(await interactor("other-secret").invoke({ token, confirmed: true })).toEqual({
      ok: true,
      data: { status: "invalid" },
    });
    expect(await interactor("  ").invoke({ token, confirmed: true })).toEqual({
      ok: true,
      data: { status: "invalid" },
    });
    expect(repo.unscopedSaves).toEqual([]);
  });

  it("reports an expired link and changes nothing", async () => {
    const token = signed("ruleAlert");
    clockNow = new Date(NOW.getTime() + 31 * DAY_MS);

    expect(await interactor().invoke({ token, confirmed: true })).toEqual({ ok: true, data: { status: "expired" } });
    expect(repo.unscopedSaves).toEqual([]);
  });

  it("changes nothing when the person is no longer an active member of that workspace", async () => {
    repo.members = [];

    expect(await interactor().invoke({ token: signed("ruleAlert"), confirmed: true })).toEqual({
      ok: true,
      data: { status: "invalid" },
    });
    expect(await interactor().invoke({ token: signed("ruleAlert"), confirmed: false })).toEqual({
      ok: true,
      data: { status: "invalid" },
    });
    expect(repo.unscopedSaves).toEqual([]);
  });
});
