import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

export abstract class ExpireAdAttributionRepo {
  abstract expireAdAttributionUnscoped(now: Date): Promise<number>;
}

@SystemInteractor
export class ExpireAdAttributionInteractor {
  constructor(private readonly repo: ExpireAdAttributionRepo) {}

  async invoke(now = new Date()): Promise<number> {
    return this.repo.expireAdAttributionUnscoped(now);
  }
}
