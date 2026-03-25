import { type ServiceDto } from "../service.schema";

import { type UpdateServiceData } from "./update-service.interactor";

export abstract class UpdateServiceRepo {
  abstract updateServiceOrThrow(args: UpdateServiceData): Promise<ServiceDto>;
  abstract getOrThrowUnscoped(id: string): Promise<ServiceDto>;
  abstract getManyOrThrowUnscoped(ids: string[]): Promise<ServiceDto[]>;
}
