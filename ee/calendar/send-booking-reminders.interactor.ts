import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

import type { BookingMailer } from "./booking-mailer";
import type { BookingReservationRepo } from "./booking-reservation.repo";

export const BOOKING_REMINDER_BATCH = 200;

@SystemInteractor
export class SendBookingRemindersInteractor {
  constructor(
    private repo: Pick<
      BookingReservationRepo,
      "listDueRemindersUnscoped" | "claimReminderUnscoped" | "releaseReminderUnscoped"
    >,
    private mailer: Pick<BookingMailer, "send">,
    private now: () => Date = () => new Date(),
  ) {}

  async invoke(): Promise<{ bookingReminders: number }> {
    const now = this.now();
    const due = await this.repo.listDueRemindersUnscoped(now, BOOKING_REMINDER_BATCH);
    let sent = 0;
    for (const booking of due) {
      if (!(await this.repo.claimReminderUnscoped(booking, now))) continue;
      if (await this.mailer.send({ kind: "reminder", booking })) sent += 1;
      else await this.repo.releaseReminderUnscoped(booking, now);
    }

    return { bookingReminders: sent };
  }
}
