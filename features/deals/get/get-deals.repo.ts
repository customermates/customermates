import { type DealDto } from "../deal.schema";
import { BaseGetRepo } from "@/core/base/base-get.repo";

export abstract class GetDealsRepo extends BaseGetRepo<DealDto> {}
