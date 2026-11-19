import type { ReactElement } from "react";

import { render } from "@react-email/render";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
  createMockDiModule,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const reporter = vi.hoisted(() => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("@/core/observability/server", () => reporter);

import deMessages from "@/i18n/locales/de.json";
import enMessages from "@/i18n/locales/en.json";

import type { BookingMail } from "../booking-mailer";

import { BookingMailer, bookingMailKey, bookingMessage } from "../booking-mailer";
import { bookingRow, MANAGE_TOKEN } from "./public-booking-fixtures";

const BASE_URL = "https://app.example.test/";
const MANAGE_URL = `https://app.example.test/book/manage/${MANAGE_TOKEN}`;
const PREVIOUS = new Date("2026-11-19T14:00:00.000Z");

type Sent = {
  to: string;
  from: string;
  replyTo?: string;
  subject: string;
  deduplicationKey: string;
  react: ReactElement<Record<string, unknown>>;
};

function mailer(result: boolean | Error = true) {
  const send = vi.fn((_args: Sent) => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)));
  return { send, subject: new BookingMailer({ send }, BASE_URL) };
}

async function sent(mail: BookingMail) {
  const { send, subject } = mailer();
  expect(await subject.send(mail)).toBe(true);
  expect(send).toHaveBeenCalledTimes(1);
  const args = send.mock.calls[0][0];
  return { ...args, text: await render(args.react, { plainText: true }), html: await render(args.react) };
}

beforeEach(() => vi.clearAllMocks());

describe("BookingMailer", () => {
  it("confirms a booking to the visitor, with replies going to the host and the manage link", async () => {
    const mail = await sent({ kind: "confirmed", booking: bookingRow() });

    expect(mail.to).toBe("ada@example.com");
    expect(mail.replyTo).toBe("test@example.com");
    expect(mail.from).toBe('"Acme via Customermates" <test@test.com>');
    expect(mail.subject).toBe("Confirmed: Intro call on Nov 20, 2026, 9:00 AM");
    expect(mail.deduplicationKey).toBe(`booking-mail/${bookingRow().id}/confirmed`);
    expect(mail.text).toContain("Hello Ada Lovelace,");
    expect(mail.text).toContain("Your booking of Intro call with Test User is confirmed.");
    expect(mail.text).toContain("Friday, November 20, 2026 at 9:00 AM (Europe/London)");
    expect(mail.text).toContain(MANAGE_URL);
    expect(mail.html).toMatch(/<html[^>]*\blang="en"/u);
  });

  it("writes in the language the booking was made in and shows the time in the visitor's time zone", async () => {
    const mail = await sent({
      kind: "confirmed",
      booking: bookingRow({ locale: "de", timeZone: "Europe/Berlin" }),
    });

    expect(mail.subject).toBe("Bestätigt: Intro call am 20.11.2026, 10:00");
    expect(mail.html).toContain(deMessages.BookingEmail.confirmedTitle);
    expect(mail.text).toContain("Freitag, 20. November 2026 um 10:00 (Europe/Berlin)");
    expect(mail.html).toMatch(/<html[^>]*\blang="de"/u);
  });

  it("falls back to English for a booking without a known language", async () => {
    for (const locale of [null, "xx"]) {
      const mail = await sent({ kind: "confirmed", booking: bookingRow({ locale }) });

      expect(mail.html).toContain(enMessages.BookingEmail.confirmedTitle);
    }
  });

  it("leaves the manage link out when the page does not let visitors change bookings", async () => {
    const mail = await sent({ kind: "confirmed", booking: bookingRow({ linkInviteeChanges: false }) });

    expect(mail.text).not.toContain("/book/manage/");
    expect(mail.text).not.toContain(enMessages.BookingEmail.manage);
  });

  it("tells the visitor the new and the previous time after a reschedule, and who moved it", async () => {
    const booking = bookingRow();
    const byHost = await sent({ kind: "rescheduled", booking, by: "host", previousStartsAt: PREVIOUS });
    const byVisitor = await sent({ kind: "rescheduled", booking, by: "invitee", previousStartsAt: PREVIOUS });

    expect(byHost.subject).toBe("Rescheduled: Intro call on Nov 20, 2026, 9:00 AM");
    expect(byHost.text).toContain("Test User moved your booking of Intro call to a new time.");
    expect(byHost.text).toContain("Friday, November 20, 2026 at 9:00 AM (Europe/London)");
    expect(byHost.text).toContain("Thursday, November 19, 2026 at 2:00 PM (Europe/London)");
    expect(byHost.text).toContain(MANAGE_URL);
    expect(byVisitor.text).toContain("is moved to the new time you chose.");
    expect(byHost.deduplicationKey).toBe(`booking-mail/${booking.id}/rescheduled/2026-11-20T09:00:00.000Z`);
  });

  it("tells the visitor about a cancellation, gives the host's reason and offers no manage link", async () => {
    const booking = bookingRow({ status: "cancelled" });
    const byHost = await sent({ kind: "cancelled", booking, by: "host", reason: " Out sick\u0007 " });
    const byVisitor = await sent({ kind: "cancelled", booking, by: "invitee", reason: "Something came up" });

    expect(byHost.subject).toBe("Cancelled: Intro call on Nov 20, 2026, 9:00 AM");
    expect(byHost.text).toContain("Test User cancelled your booking of Intro call.");
    expect(byHost.text).toContain("Out sick");
    expect(byHost.text).not.toContain("\u0007");
    expect(byHost.text).not.toContain("/book/manage/");
    expect(byHost.replyTo).toBe("test@example.com");
    expect(byVisitor.text).toContain("is cancelled, as you asked.");
    expect(byVisitor.text).not.toContain("Something came up");
    expect(byVisitor.text).not.toContain(enMessages.BookingEmail.labelReason);
  });

  it("reminds the visitor of the meeting", async () => {
    const mail = await sent({ kind: "reminder", booking: bookingRow() });

    expect(mail.subject).toBe("Reminder: Intro call on Nov 20, 2026, 9:00 AM");
    expect(mail.text).toContain("A reminder of your booking of Intro call with Test User.");
    expect(mail.text).toContain(MANAGE_URL);
    expect(mail.replyTo).toBe("test@example.com");
  });

  it("keys each kind of email once per booking, and a reminder or a reschedule once per start", () => {
    const booking = bookingRow();
    const moved = bookingRow({ startsAt: PREVIOUS });

    expect(bookingMailKey({ kind: "confirmed", booking })).toBe(bookingMailKey({ kind: "confirmed", booking: moved }));
    expect(bookingMailKey({ kind: "reminder", booking })).not.toBe(
      bookingMailKey({ kind: "reminder", booking: moved }),
    );
    expect(bookingMailKey({ kind: "reminder", booking })).not.toBe(bookingMailKey({ kind: "confirmed", booking }));
  });

  it("uses the workspace's name, logo and accent colour", async () => {
    const mail = await sent({
      kind: "confirmed",
      booking: bookingRow({ brand: { accentColor: "#0f62fe", logoKey: "logo_key_abcdefghijkl" } }),
    });

    expect(mail.html).toContain("https://app.example.test/api/brand/logo/logo_key_abcdefghijkl");
    expect(mail.html).toContain("background-color:#0f62fe");
    expect(mail.html).not.toContain("customermates-icon");
    expect(mail.text).toContain("Acme");
  });

  it("shows no logo and the default button for a workspace without branding", async () => {
    const message = await bookingMessage({ kind: "confirmed", booking: bookingRow({ workspaceName: null }) }, BASE_URL);

    expect(message.props).toMatchObject({ logoUrl: null, accent: null });
    expect(message.props).not.toHaveProperty("brandName");
    expect(message.from).toBe("Customermates <test@test.com>");
    expect(message.props.footer).toContain("Test User");
  });

  it("answers false and reports instead of throwing when the email cannot be sent", async () => {
    const refused = mailer(false);
    const failing = mailer(new Error("mail down"));

    expect(await refused.subject.send({ kind: "confirmed", booking: bookingRow() })).toBe(false);
    expect(await failing.subject.send({ kind: "confirmed", booking: bookingRow() })).toBe(false);
    expect(reporter.captureException).toHaveBeenCalledTimes(1);
  });
});
