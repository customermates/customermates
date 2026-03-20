import { type ServiceDto } from "../service.schema";

import { type UpdateServiceData } from "./update-service.interactor";

export abstract class UpdateServiceRepo {
  abstract updateServiceOrThrow(args: UpdateServiceData): Promise<ServiceDto>;
  abstract getServiceByIdOrThrow(id: string): Promise<ServiceDto>;
}
