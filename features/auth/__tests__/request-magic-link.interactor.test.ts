import type { AuthService } from "../auth.service";
import type * as EnvModule from "@/env";

import { beforeEach, describe, expect, it, vi } from "vitest";

const appMode = vi.hoisted(() => ({ value: "cloud" }));

vi.mock("@/env", async (importOriginal) => {
  const actual = await importOriginal<typeof EnvModule>();
  return {
    env: {
      ...actual.env,
      get APP_MODE() {
        return appMode.value;
      },
    },
  };
});
vi.mock("next-intl/server", () => ({
  getLocale: vi.fn().mockResolvedValue("en"),
  getTranslations: vi.fn().mockResolvedValue(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

import { MAGIC_LINK_REQUESTS_PER_HOUR, RequestMagicLinkInteractor } from "../request-magic-link.interactor";

function buildInteractor(recentRequests = 0) {
  const requestMagicLink = vi.fn().mockResolvedValue(undefined);
  const countMagicLinksSince = vi.fn().mockResolvedValue(recentRequests);
  const interactor = new RequestMagicLinkInteractor({
    requestMagicLink,
    countMagicLinksSince,
  } as unknown as AuthService);
  return { interactor, requestMagicLink, countMagicLinksSince };
}

function emailErrors(result: unknown): string[] {
  const failure = result as { ok: false; error: { issues: { path: string[]; message: string }[] } };
  return failure.error.issues.filter((issue) => issue.path[0] === "email").map((issue) => issue.message);
}

beforeEach(() => {
  appMode.value = "cloud";
});

describe("RequestMagicLinkInteractor", () => {
  it("sends the link to a normalized address and returns to sign-in on a broken link", async () => {
    const { interactor, requestMagicLink, countMagicLinksSince } = buildInteractor();

    await expect(interactor.invoke({ email: "Known.User@Gmail.com" })).resolves.toEqual({
      ok: true,
      data: { email: "known.user@gmail.com" },
    });

    expect(countMagicLinksSince).toHaveBeenCalledWith("known.user@gmail.com", expect.any(Date));
    expect(requestMagicLink).toHaveBeenCalledExactlyOnceWith({
      email: "known.user@gmail.com",
      callbackURL: undefined,
      errorCallbackURL: "/auth/signin",
    });
  });

  it("answers an unknown address the same way, so the account is created when the link is opened", async () => {
    const { interactor, requestMagicLink } = buildInteractor();

    await expect(interactor.invoke({ email: "brand.new@example.com", callbackURL: "/onboarding" })).resolves.toEqual({
      ok: true,
      data: { email: "brand.new@example.com" },
    });
    expect(requestMagicLink).toHaveBeenCalledWith(expect.objectContaining({ callbackURL: "/onboarding" }));
  });

  it("keeps the invitation in the error callback", async () => {
    const { interactor, requestMagicLink } = buildInteractor();

    await interactor.invoke({ email: "invited@example.com", callbackURL: "/auth/invitation?intent=signed.intent" });

    expect(requestMagicLink).toHaveBeenCalledWith(
      expect.objectContaining({
        callbackURL: "/auth/invitation?intent=signed.intent",
        errorCallbackURL: "/auth/signin?intent=signed.intent",
      }),
    );
  });

  it("refuses a temporary email address in the cloud without sending anything", async () => {
    const { interactor, requestMagicLink } = buildInteractor();

    const result = await interactor.invoke({ email: "someone@mailinator.com" });

    expect(result).toMatchObject({ ok: false });
    expect(emailErrors(result)).toEqual(["Common.errors.disposableEmail"]);
    expect(requestMagicLink).not.toHaveBeenCalled();
  });

  it("refuses a subdomain of a temporary email provider", async () => {
    const { interactor, requestMagicLink } = buildInteractor();

    const result = await interactor.invoke({ email: "someone@inbox.mailinator.com" });

    expect(result).toMatchObject({ ok: false });
    expect(requestMagicLink).not.toHaveBeenCalled();
  });

  it("lets self-hosted installations use any address", async () => {
    appMode.value = "self-hosted";
    const { interactor, requestMagicLink } = buildInteractor();

    await expect(interactor.invoke({ email: "someone@mailinator.com" })).resolves.toMatchObject({ ok: true });
    expect(requestMagicLink).toHaveBeenCalledOnce();
  });

  it("stops after the hourly limit of links for one address", async () => {
    const { interactor, requestMagicLink } = buildInteractor(MAGIC_LINK_REQUESTS_PER_HOUR);

    const result = await interactor.invoke({ email: "busy@example.com" });

    expect(result).toMatchObject({ ok: false });
    expect((result as { error: { issues: { message: string }[] } }).error.issues[0]?.message).toBe(
      "Common.errors.magicLinkRateLimited",
    );
    expect(requestMagicLink).not.toHaveBeenCalled();
  });

  it("sends the last link below the limit", async () => {
    const { interactor, requestMagicLink } = buildInteractor(MAGIC_LINK_REQUESTS_PER_HOUR - 1);

    await expect(interactor.invoke({ email: "busy@example.com" })).resolves.toMatchObject({ ok: true });
    expect(requestMagicLink).toHaveBeenCalledOnce();
  });

  it("rejects a malformed invitation callback", async () => {
    const { interactor, requestMagicLink } = buildInteractor();

    await expect(
      interactor.invoke({ email: "invited@example.com", callbackURL: "/auth/invitation?intent=a&intent=b" }),
    ).resolves.toEqual({ redirect: "/auth/error?type=invalidOnboardingIntent" });
    expect(requestMagicLink).not.toHaveBeenCalled();
  });
});
