import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
  createMockDiModule,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import type { BookingRow } from "../booking-reservation.repo";

import { BOOKING_REMINDER_BATCH, SendBookingRemindersInteractor } from "../send-booking-reminders.interactor";
import { bookingRow } from "./public-booking-fixtures";

const NOW = new Date("2026-11-19T10:00:00.000Z");

function build(due: BookingRow[], options: { claimed?: (id: string) => boolean; sent?: (id: string) => boolean } = {}) {
  const repo = {
    listDueRemindersUnscoped: vi.fn().mockResolvedValue(due),
    claimReminderUnscoped: vi.fn((booking: Pick<BookingRow, "id">) =>
      Promise.resolve(options.claimed?.(booking.id) ?? true),
    ),
    releaseReminderUnscoped: vi.fn().mockResolvedValue(undefined),
  };
  const mailer = {
    send: vi.fn((mail: { booking: Pick<BookingRow, "id"> }) =>
      Promise.resolve(options.sent?.(mail.booking.id) ?? true),
    ),
  };
  return { repo, mailer, interactor: new SendBookingRemindersInteractor(repo, mailer, () => NOW) };
}

beforeEach(() => vi.clearAllMocks());

describe("SendBookingRemindersInteractor", () => {
  it("asks for the bookings that start within a day and reminds each visitor", async () => {
    const first = bookingRow();
    const second = bookingRow({ id: "booking-2", locale: "de" });
    const { interactor, repo, mailer } = build([first, second]);

    expect(await interactor.invoke()).toEqual({ bookingReminders: 2 });

    expect(repo.listDueRemindersUnscoped).toHaveBeenCalledWith(NOW, BOOKING_REMINDER_BATCH);
    expect(repo.claimReminderUnscoped.mock.calls).toEqual([
      [first, NOW],
      [second, NOW],
    ]);
    expect(mailer.send.mock.calls).toEqual([
      [{ kind: "reminder", booking: first }],
      [{ kind: "reminder", booking: second }],
    ]);
    expect(repo.releaseReminderUnscoped).not.toHaveBeenCalled();
  });

  it("sends nothing when no booking is due", async () => {
    const { interactor, repo, mailer } = build([]);

    expect(await interactor.invoke()).toEqual({ bookingReminders: 0 });
    expect(repo.claimReminderUnscoped).not.toHaveBeenCalled();
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("sends exactly once: a booking another run claimed, or one cancelled or moved meanwhile, gets no email", async () => {
    const taken = bookingRow({ id: "booking-taken" });
    const free = bookingRow({ id: "booking-free" });
    const { interactor, mailer, repo } = build([taken, free], { claimed: (id) => id === "booking-free" });

    expect(await interactor.invoke()).toEqual({ bookingReminders: 1 });
    expect(mailer.send.mock.calls).toEqual([[{ kind: "reminder", booking: free }]]);
    expect(repo.releaseReminderUnscoped).not.toHaveBeenCalled();
  });

  it("frees the claim of a reminder that could not be sent, so the next run sends it", async () => {
    const failing = bookingRow({ id: "booking-failing" });
    const fine = bookingRow({ id: "booking-fine" });
    const { interactor, repo } = build([failing, fine], { sent: (id) => id === "booking-fine" });

    expect(await interactor.invoke()).toEqual({ bookingReminders: 1 });
    expect(repo.releaseReminderUnscoped.mock.calls).toEqual([[failing, NOW]]);
  });
});
