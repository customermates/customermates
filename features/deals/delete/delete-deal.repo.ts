import { type DealDto } from "../deal.schema";

export abstract class DeleteDealRepo {
  abstract deleteDealOrThrow(id: string): Promise<DealDto>;
}
