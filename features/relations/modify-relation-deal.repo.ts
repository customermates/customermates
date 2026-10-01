import type { DealDto } from "@/features/deals/deal.schema";
import type { ReadableIds } from "./modify-entity-relation.interactor";

export abstract class ModifyRelationDealRepo {
  abstract getOrThrowCompanyWide(id: string): Promise<DealDto>;
  abstract findIds(ids: Set<string>): Promise<ReadableIds>;
}
