import { type ServiceDto } from "../service.schema";
import { BaseGetRepo } from "@/core/base/base-get.repo";

export abstract class GetServicesRepo extends BaseGetRepo<ServiceDto> {}
