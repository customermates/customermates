import type { TurnOffNotificationEmailsState } from "../turn-off-notification-emails-view";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${Object.values(values).join(",")}` : key,
}));
vi.mock("next/image", () => ({ default: () => null }));

import { TurnOffNotificationEmailsView } from "../turn-off-notification-emails-view";

const DETAILS = { kindLabel: "Automation alerts", maskedEmail: "s•••@acme.example", workspaceName: "Acme" };

function html(state: TurnOffNotificationEmailsState): string {
  return renderToStaticMarkup(createElement(TurnOffNotificationEmailsView, { state }));
}

describe("TurnOffNotificationEmailsView", () => {
  it("names the kind, the workspace and the masked address before it asks, and posts the token on confirm", () => {
    const page = html({ status: "pending", token: "tok-1", ...DETAILS });

    expect(page).toContain("Notifications.turnOff.title");
    expect(page).toContain("Notifications.turnOff.body:Automation alerts,s•••@acme.example,Acme");
    expect(page).toMatch(/<form[^>]*action="\/api\/notifications\/unsubscribe"[^>]*method="post"/u);
    expect(page).toMatch(/<input[^>]*name="token"[^>]*value="tok-1"/u);
  });

  it("states whose emails are switched off, with no form and a link to the settings", () => {
    const page = html({
      status: "off",
      settingsHref: "https://app.example.test/en/w/ws-1/settings/profile",
      ...DETAILS,
    });

    expect(page).toContain("Notifications.turnOff.doneTitle");
    expect(page).toContain("Notifications.turnOff.doneBody:Automation alerts,s•••@acme.example,Acme");
    expect(page).not.toContain("<form");
    expect(page).toContain('href="https://app.example.test/en/w/ws-1/settings/profile"');
  });

  it("explains an expired and a wrong link with nothing to confirm", () => {
    const expired = html({ status: "expired" });
    expect(expired).toContain("Notifications.turnOff.expiredTitle");
    expect(expired).toContain("Notifications.turnOff.expiredBody");
    expect(expired).not.toContain("<form");

    const invalid = html({ status: "invalid" });
    expect(invalid).toContain("Notifications.turnOff.invalidTitle");
    expect(invalid).toContain("Notifications.turnOff.invalidBody");
    expect(invalid).not.toContain("<form");
    expect(invalid).not.toContain("<a ");
  });
});
