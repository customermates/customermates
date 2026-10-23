import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  copy: vi.fn(),
  isLoading: false,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    companyInviteModalStore: {
      form: { inviteLink: "http://localhost:4000/invitation/token", expiresAt: null },
      isLoading: harness.isLoading,
    },
    intlStore: { formatDescriptiveShortDateTime: () => "date" },
  }),
}));

vi.mock("@/core/utils/use-copy-to-clipboard", () => ({
  useCopyToClipboard: () => harness.copy,
}));

vi.mock("@/components/modal", () => ({
  AppModal: ({ children }: { children: ReactNode }) => createElement("div", null, children),
}));

vi.mock("../invite-by-email-form", () => ({
  InviteByEmailForm: () => createElement("div", { "data-invite-by-email": true }),
}));

import { CompanyInviteModal } from "../company-invite-modal";

function buttons(html: string) {
  return html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
}

describe("CompanyInviteModal", () => {
  beforeEach(() => {
    harness.isLoading = false;
  });

  it.each([false, true])("names the icon-only copy-link button while loading is %s", (isLoading) => {
    harness.isLoading = isLoading;

    const html = renderToStaticMarkup(createElement(CompanyInviteModal));
    const copyButton = buttons(html).find((button) => button.includes('id="invite-modal-copy-link"'));

    expect(copyButton).toBeDefined();
    expect(copyButton).toContain('aria-label="Common.actions.copy"');
  });

  it("gives every button in the link tab an accessible name", () => {
    const html = renderToStaticMarkup(createElement(CompanyInviteModal));

    for (const button of buttons(html)) {
      const hasLabel = /\saria-label="[^"]+"/.test(button);
      const hasText = />[^<]*[^\s<][^<]*</.test(button);

      expect(hasLabel || hasText, button).toBe(true);
    }
  });
});
