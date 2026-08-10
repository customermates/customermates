import type { AuthService } from "../auth.service";
import type { FindUserRepo } from "@/features/user/user.service";

import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl/server", () => ({
  getLocale: vi.fn().mockResolvedValue("de"),
  getTranslations: vi.fn().mockResolvedValue(
    Object.assign((key: string) => key, {
      raw: (key: string) => key,
    }),
  ),
}));

import { ContinueWithSocialsInteractor } from "../continue-with-socials.interactor";

describe("ContinueWithSocialsInteractor callback validation", () => {
  it.each(["google", "microsoft"] as const)(
    "rejects an external callback before invoking the %s auth provider",
    async (provider) => {
      const continueWithSocials = vi.fn();
      const interactor = new ContinueWithSocialsInteractor(
        { continueWithSocials } as unknown as AuthService,
        { findCurrentUserUnscoped: vi.fn() } as unknown as FindUserRepo,
      );

      const result = await interactor.invoke({
        provider,
        callbackURL: "https://malicious.example/collect-session",
        errorCallbackURL: "/de/auth/error",
      });

      expect(result).toMatchObject({ ok: false });
      if ("ok" in result && !result.ok) expect(result.error.issues[0].message).toBe("Common.errors.invalidCallbackUrl");
      expect(continueWithSocials).not.toHaveBeenCalled();
    },
  );
});
