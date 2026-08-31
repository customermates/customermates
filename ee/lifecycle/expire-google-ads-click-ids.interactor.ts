import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

export abstract class ExpireGoogleAdsClickIdsRepo {
  abstract expireGoogleAdsClickIdsUnscoped(now: Date): Promise<number>;
}

@SystemInteractor
export class ExpireGoogleAdsClickIdsInteractor {
  constructor(private readonly repo: ExpireGoogleAdsClickIdsRepo) {}

  async invoke(now = new Date()): Promise<number> {
    return this.repo.expireGoogleAdsClickIdsUnscoped(now);
  }
}
