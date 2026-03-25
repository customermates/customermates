import { type DealDto } from "../deal.schema";

export abstract class DeleteDealRepo {
  abstract getOrThrowUnscoped(id: string): Promise<DealDto>;
  abstract getManyOrThrowUnscoped(ids: string[]): Promise<DealDto[]>;
  abstract deleteDealOrThrow(id: string): Promise<DealDto>;
}
