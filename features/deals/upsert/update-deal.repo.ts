import { type DealDto } from "../deal.schema";

import { type UpdateDealData } from "./update-deal.interactor";

export abstract class UpdateDealRepo {
  abstract updateDealOrThrow(args: UpdateDealData): Promise<DealDto>;
  abstract getOrThrowUnscoped(id: string): Promise<DealDto>;
  abstract getManyOrThrowUnscoped(ids: string[]): Promise<DealDto[]>;
}
