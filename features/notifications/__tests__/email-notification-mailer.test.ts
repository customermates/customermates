import type { ReactElement } from "react";

import { describe, expect, it, vi } from "vitest";

import { Locale } from "@/generated/prisma";
import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);

import { EmailNotificationMailer } from "../email-notification-mailer";
import { notificationUnsubscribeSecret, verifyNotificationUnsubscribe } from "../notification-unsubscribe-token";

const COMPANY = "00000000-0000-4000-8000-000000000011";
const ME = "00000000-0000-4000-8000-000000000010";
const NOW = new Date("2026-11-17T08:00:00.000Z");
const AUTH_SECRET = "auth-secret";
const SECRET = notificationUnsubscribeSecret(AUTH_SECRET) as string;

const recipient = (displayLanguage: Locale = Locale.en) => ({
  id: ME,
  email: "me@example.test",
  firstName: "Sofia",
  displayLanguage,
  workspaceSlug: "ws-1",
  workspaceName: "Acme",
});

function notification(overrides: Partial<Parameters<EmailNotificationMailer["sendInstant"]>[1]> = {}) {
  return {
    id: "00000000-0000-4000-8000-0000000000a1",
    companyId: COMPANY,
    userId: ME,
    kind: "ruleAlert" as const,
    title: "Deal went quiet",
    body: null,
    href: "/records/x",
    readAt: null,
    createdAt: NOW,
    sourceRuleId: null,
    sourceRuleName: null,
    ...overrides,
  };
}

async function sent(
  run: (mailer: EmailNotificationMailer) => Promise<boolean>,
  authSecret: string | undefined = AUTH_SECRET,
) {
  const send = vi.fn().mockResolvedValue(true);
  const mailer = new EmailNotificationMailer({ send, isConfigured: () => true }, authSecret, () => NOW);
  await run(mailer);
  const message = send.mock.calls[0][0] as { subject: string; react: ReactElement };
  return { message, props: message.react.props as Record<string, any> };
}

describe("the notification email footer", () => {
  it("names the automation rule as the reason when the notification came from one", async () => {
    const { props } = await sent((mailer) =>
      mailer.sendInstant(
        recipient(),
        notification({ sourceRuleId: "rule-1", sourceRuleName: "Follow up after 3 days" }),
      ),
    );

    expect(props.footerReason).toBe("You get this because Follow up after 3 days notified you.");
  });

  it("names the kind as the reason when no automation sent it", async () => {
    const { props } = await sent((mailer) =>
      mailer.sendInstant(recipient(), notification({ kind: "dueToday", title: "Call Sofia" })),
    );

    expect(props.footerReason).toBe("You get this because Due today notified you.");
  });

  it("carries a signed turn-off link for the kind and a link to manage notifications", async () => {
    const { props } = await sent((mailer) => mailer.sendInstant(recipient(), notification({ kind: "replyReceived" })));

    expect(props.turnOffLinks).toHaveLength(1);
    expect(props.turnOffLinks[0].label).toBe("Turn off this kind");
    const url = new URL(props.turnOffLinks[0].href);
    expect(url.origin + url.pathname).toBe("http://localhost:4000/api/notifications/unsubscribe");
    expect(verifyNotificationUnsubscribe(SECRET, url.searchParams.get("token") ?? "", NOW)).toEqual({
      status: "valid",
      userId: ME,
      companyId: COMPANY,
      kind: "replyReceived",
    });
    expect(props.manage).toEqual({
      label: "Manage notifications",
      href: "http://localhost:4000/en/w/ws-1/settings/profile",
    });
  });

  it("lists every source and offers one turn-off link per kind in a digest", async () => {
    const { props, message } = await sent((mailer) =>
      mailer.sendDigest(recipient(), [
        notification({ id: "00000000-0000-4000-8000-0000000000a1", kind: "dueToday" }),
        notification({
          id: "00000000-0000-4000-8000-0000000000a2",
          kind: "ruleAlert",
          sourceRuleId: "rule-1",
          sourceRuleName: "Stale deals",
        }),
        notification({
          id: "00000000-0000-4000-8000-0000000000a3",
          kind: "ruleAlert",
          sourceRuleId: "rule-1",
          sourceRuleName: "Stale deals",
        }),
      ]),
    );

    expect(message.subject).toBe("New updates in Customermates");
    expect(props.footerReason).toBe("You get this because Due today and Stale deals notified you.");
    expect(props.turnOffLinks.map((link: { label: string }) => link.label)).toEqual([
      "Turn off Due today",
      "Turn off Automation alerts",
    ]);
    const kinds = props.turnOffLinks.map(
      (link: { href: string }) =>
        (verifyNotificationUnsubscribe(SECRET, new URL(link.href).searchParams.get("token") ?? "", NOW) as any).kind,
    );
    expect(kinds).toEqual(["dueToday", "ruleAlert"]);
  });

  it("opens the record from an instant mail and the Notifications page from a digest", async () => {
    const instant = await sent((mailer) => mailer.sendInstant(recipient(), notification()));
    const digest = await sent((mailer) =>
      mailer.sendDigest(recipient(), [
        notification(),
        notification({ id: "00000000-0000-4000-8000-0000000000a2", href: "/records/y" }),
      ]),
    );

    expect(instant.props.href).toBe("http://localhost:4000/en/w/ws-1/records/x");
    expect(digest.props.href).toBe("http://localhost:4000/en/w/ws-1/notifications");
    expect(digest.props.more).toBeUndefined();
  });

  it("says how many notifications a long digest leaves out and links them to the Notifications page", async () => {
    const many = Array.from({ length: 23 }, (_, index) =>
      notification({ id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`, title: `Item ${index}` }),
    );

    const english = await sent((mailer) => mailer.sendDigest(recipient(), many));
    const oneMore = await sent((mailer) => mailer.sendDigest(recipient(), many.slice(0, 21)));
    const german = await sent((mailer) => mailer.sendDigest(recipient(Locale.de), many));

    expect(english.props.items).toHaveLength(20);
    expect(english.props.more).toEqual({
      label: "and 3 more updates",
      href: "http://localhost:4000/en/w/ws-1/notifications",
    });
    expect(oneMore.props.more.label).toBe("and 1 more update");
    expect(german.props.more.label).toBe("und 3 weitere Neuigkeiten");
  });

  it("gives the same set of notifications the same delivery key, whatever their order and number", async () => {
    const send = vi.fn().mockResolvedValue(true);
    const mailer = new EmailNotificationMailer({ send, isConfigured: () => true }, AUTH_SECRET, () => NOW);
    const many = Array.from({ length: 12 }, (_, index) =>
      notification({ id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}` }),
    );

    await mailer.sendDigest(recipient(), many);
    await mailer.sendDigest(recipient(), [...many].reverse());
    await mailer.sendDigest(recipient(), many.slice(0, 11));
    await mailer.sendInstant(recipient(), many[0]);
    const keys = send.mock.calls.map((call) => call[0].deduplicationKey as string);

    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
    expect(keys[3]).toBe(`notification:instant:${many[0].id}`);
    expect(keys.every((key) => key.length <= 256)).toBe(true);
  });

  it("writes the footer in the language of the person", async () => {
    const { props } = await sent((mailer) =>
      mailer.sendInstant(recipient(Locale.de), notification({ kind: "dueToday" })),
    );

    expect(props.footerReason).toBe("Du bekommst diese E-Mail, weil dich Heute fällig benachrichtigt hat.");
    expect(props.turnOffLinks[0].label).toBe("Diese Art ausschalten");
    expect(props.manage.label).toBe("Benachrichtigungen verwalten");
    expect(props.manage.href).toBe("http://localhost:4000/de/w/ws-1/settings/profile");
  });

  it("returns false without calling the mail service on a server that has no mail provider", async () => {
    const send = vi.fn().mockRejectedValue(new Error("RESEND_API_KEY is not configured"));
    const mailer = new EmailNotificationMailer({ send, isConfigured: () => false }, AUTH_SECRET, () => NOW);

    expect(mailer.isConfigured()).toBe(false);
    await expect(mailer.sendInstant(recipient(), notification())).resolves.toBe(false);
    await expect(mailer.sendDigest(recipient(), [notification()])).resolves.toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("still sends the manage link when no signing secret is configured", async () => {
    const { props } = await sent((mailer) => mailer.sendInstant(recipient(), notification()), "  ");

    expect(props.turnOffLinks).toEqual([]);
    expect(props.manage.label).toBe("Manage notifications");
  });
});
