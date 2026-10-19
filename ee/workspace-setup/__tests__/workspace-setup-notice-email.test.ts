import { describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);

import type { ReactElement } from "react";
import type { SetupNotice } from "../workspace-setup-notifier";

import { render } from "@react-email/render";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { APP_LOCALES, type AppLocale } from "@/i18n/locale-registry";
import { createMockUser } from "@/tests/helpers/mock-user";

import { WorkspaceSetupNotifier } from "../workspace-setup-notifier";

const NOTICES: SetupNotice[] = ["planReady", "planFailed", "workspaceReady", "workspaceFailed"];
const WORKSPACE = "Bergmann Steuern";

async function sentEmail(locale: AppLocale, notice: SetupNotice) {
  const owner = createMockUser({ firstName: "Mara", displayLanguage: locale as never });
  const sent: Array<{ to: string; subject: string; react: ReactElement }> = [];
  const email = { send: vi.fn((message: (typeof sent)[number]) => Promise.resolve(Boolean(sent.push(message)))) };
  const company = { id: owner.companyId, name: WORKSPACE, createdAt: new Date(0), updatedAt: new Date(0) };
  const notifier = new WorkspaceSetupNotifier(email as never, { findCompanyOrThrow: () => Promise.resolve(company) });
  await runWithTenant(owner, () => notifier.send(notice));
  const [message] = sent;
  return { owner, message, html: await render(message.react), text: await render(message.react, { plainText: true }) };
}

describe("the workspace setup notice email", () => {
  it.each(APP_LOCALES.flatMap((locale) => NOTICES.map((notice) => [locale, notice] as const)))(
    "renders the %s %s notice with the workspace name and a link into that workspace's setup",
    async (locale, notice) => {
      const { owner, message, html, text } = await sentEmail(locale, notice);

      expect(message.to).toBe(owner.email);
      expect(message.subject).toContain(WORKSPACE);
      expect(text).toContain(WORKSPACE);
      expect(text).toContain("Mara");
      expect(html).toContain(`/${locale}/onboarding/wizard?workspace=${owner.companyId}`);
      expect(text).not.toMatch(/\{[a-zA-Z]+\}/u);
    },
  );
});
