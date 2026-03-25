import type { DealDto } from "./deal.schema";

export abstract class GetUnscopedDealRepo {
  abstract getOrThrowUnscoped(id: string): Promise<DealDto>;
  abstract getManyOrThrowUnscoped(ids: string[]): Promise<DealDto[]>;
}
