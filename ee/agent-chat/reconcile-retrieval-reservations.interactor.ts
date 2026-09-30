import type { AgentUsageService } from "./agent-usage.service";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

@SystemInteractor
export class ReconcileRetrievalReservationsInteractor {
  constructor(private usage: AgentUsageService) {}

  async invoke(now = new Date()) {
    const releasedRetrievalReservations = await this.usage.releaseStaleRetrievalReservations(now);
    const settledPlatformReservations = await this.usage.settleStalePlatformReservations(now);
    return { releasedRetrievalReservations, settledPlatformReservations };
  }
}
