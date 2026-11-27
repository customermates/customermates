import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/modal", () => ({ AppModal: () => null }));
vi.mock("@/app/[locale]/(public)/auth/verify-email/email-code-form", () => ({ EmailCodeForm: () => null }));

import { VerifyEmailAction } from "../verify-email-action";

describe("VerifyEmailAction", () => {
  it("names the icon-only verify action in the top bar", () => {
    const markup = renderToStaticMarkup(createElement(VerifyEmailAction, { email: "owner@example.com" }));

    expect(markup).toContain('id="settings-profile-verify-email"');
    expect(markup).toContain('aria-label="EmailVerification.verify"');
    expect(markup).toContain("lucide-mail-warning");
  });
});
