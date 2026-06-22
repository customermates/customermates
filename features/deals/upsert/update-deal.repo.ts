import { type DealDto } from "../deal.schema";

import { type UpdateDealData } from "./update-deal.interactor";

export abstract class UpdateDealRepo {
  abstract updateDealOrThrow(args: UpdateDealData): Promise<DealDto>;
  abstract getOrThrowCompanyWide(id: string): Promise<DealDto>;
  abstract getManyOrThrowCompanyWide(ids: string[]): Promise<DealDto[]>;
}
