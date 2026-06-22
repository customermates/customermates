import { type DealDto } from "../deal.schema";

export abstract class DeleteDealRepo {
  abstract getOrThrowCompanyWide(id: string): Promise<DealDto>;
  abstract getManyOrThrowCompanyWide(ids: string[]): Promise<DealDto[]>;
  abstract deleteDealOrThrow(id: string): Promise<DealDto>;
}
