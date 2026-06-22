import type { DealDto } from "./deal.schema";

export abstract class GetCompanyWideDealRepo {
  abstract getOrThrowCompanyWide(id: string): Promise<DealDto>;
  abstract getManyOrThrowCompanyWide(ids: string[]): Promise<DealDto[]>;
}
