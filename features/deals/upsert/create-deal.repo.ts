import { type DealDto } from "../deal.schema";

import { type CreateDealData } from "./create-deal.interactor";

export abstract class CreateDealRepo {
  abstract createDealOrThrow(args: CreateDealData): Promise<DealDto>;
}
