import type { UpdateManyDealsData } from "@/features/deals/upsert/update-many-deals.interactor";
import type { DealDto } from "@/features/deals/deal.schema";
import type { Validated } from "@/core/validation/validation.utils";

export abstract class ModifyRelationUpdateDealsPort {
  abstract invoke(data: UpdateManyDealsData): Validated<DealDto[]>;
}
