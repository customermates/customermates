import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { pruneInBatches } from "@/core/utils/prune-in-batches";

import type { BookingReservationRepo } from "./booking-reservation.repo";

export const BOOKING_RETENTION_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

@SystemInteractor
export class PruneBookingsInteractor {
  constructor(private repo: Pick<BookingReservationRepo, "deleteExpiredUnscoped">) {}

  async invoke(args: { now?: Date } = {}): Promise<{ pruned: number }> {
    const now = args.now ?? new Date();
    const endedBefore = new Date(now.getTime() - BOOKING_RETENTION_DAYS * DAY_MS);
    const abandonedBefore = new Date(now.getTime() - DAY_MS);
    return {
      pruned: await pruneInBatches((limit) => this.repo.deleteExpiredUnscoped({ endedBefore, abandonedBefore }, limit)),
    };
  }
}
