import { type ServiceDto } from "../service.schema";

import { type CreateServiceData } from "./create-service.interactor";

export abstract class CreateServiceRepo {
  abstract createServiceOrThrow(args: CreateServiceData): Promise<ServiceDto>;
}
