import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/core/errors/report-application-error", () => ({ runUserAction: vi.fn() }));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ userStore: { resendVerificationEmail: vi.fn() } }),
}));

import { VerifyEmailAction } from "../verify-email-action";

describe("VerifyEmailAction", () => {
  it("keeps the resend action named when its visible label is hidden at narrow widths", () => {
    const markup = renderToStaticMarkup(createElement(VerifyEmailAction));

    expect(markup).toContain('id="profile-settings-verify-email"');
    expect(markup).toContain('aria-label="EmailVerification.resend"');
    expect(markup).toContain('<span class="hidden sm:inline">EmailVerification.resend</span>');
  });
});
