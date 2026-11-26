import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkBotId: vi.fn(),
  captureException: vi.fn(),
  env: { APP_MODE: "self-hosted", VERCEL_ENV: undefined as string | undefined, NODE_ENV: "test" },
}));

vi.mock("botid/server", () => ({ checkBotId: mocks.checkBotId }));
vi.mock("@/core/observability/server", () => ({ captureException: mocks.captureException }));
vi.mock("@/env", () => ({ env: mocks.env }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));
vi.mock("@/core/utils/action-result", () => ({
  serializeActionFailure: (failure: { issues: { message: string }[] }) => ({
    ok: false,
    error: { errors: failure.issues.map((issue) => issue.message) },
  }),
}));

import { botCheckEnabled, checkForBot, refuseBots } from "../bot-check";

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(mocks.env, { APP_MODE: "cloud", VERCEL_ENV: "production", NODE_ENV: "production" });
});

describe("bot check", () => {
  it("does nothing for self-hosted installations", async () => {
    mocks.env.APP_MODE = "self-hosted";

    expect(botCheckEnabled()).toBe(false);
    await expect(checkForBot()).resolves.toEqual({ ok: true });
    await expect(refuseBots()).resolves.toBeNull();
    expect(mocks.checkBotId).not.toHaveBeenCalled();
  });

  it("does nothing in the cloud build when it does not run on Vercel or runs in tests", async () => {
    mocks.env.VERCEL_ENV = undefined;
    await expect(checkForBot()).resolves.toEqual({ ok: true });

    mocks.env.VERCEL_ENV = "preview";
    mocks.env.NODE_ENV = "test";
    await expect(checkForBot()).resolves.toEqual({ ok: true });

    expect(mocks.checkBotId).not.toHaveBeenCalled();
  });

  it("lets a human through on a cloud deployment", async () => {
    mocks.checkBotId.mockResolvedValue({ isBot: false, isHuman: true });

    await expect(checkForBot()).resolves.toEqual({ ok: true });
    await expect(refuseBots()).resolves.toBeNull();
  });

  it("refuses a bot with a typed failure and a translated message", async () => {
    mocks.checkBotId.mockResolvedValue({ isBot: true, isHuman: false });

    await expect(checkForBot()).resolves.toEqual({ ok: false, error: "botDetected" });
    await expect(refuseBots()).resolves.toEqual({ ok: false, error: { errors: ["Common.errors.botDetected"] } });
  });

  it("reports a failed verification and lets the request through instead of locking people out", async () => {
    const failure = new Error("OIDC token missing");
    mocks.checkBotId.mockRejectedValue(failure);

    await expect(checkForBot()).resolves.toEqual({ ok: true });
    expect(mocks.captureException).toHaveBeenCalledWith(expect.objectContaining({ cause: failure }), {
      level: "warning",
      tags: { kind: "bot-check" },
    });
    expect(mocks.captureException.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });
});
