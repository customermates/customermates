import type { UpdateManyServicesData } from "@/features/services/upsert/update-many-services.interactor";
import type { ServiceDto } from "@/features/services/service.schema";
import type { Validated } from "@/core/validation/validation.utils";

export abstract class ModifyRelationUpdateServicesPort {
  abstract invoke(data: UpdateManyServicesData): Validated<ServiceDto[]>;
}
