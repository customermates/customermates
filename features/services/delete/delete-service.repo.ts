import type { ServiceDto } from "../service.schema";

export abstract class DeleteServiceRepo {
  abstract getOrThrowUnscoped(id: string): Promise<ServiceDto>;
  abstract getManyOrThrowUnscoped(ids: string[]): Promise<ServiceDto[]>;
  abstract deleteServiceOrThrow(id: string): Promise<ServiceDto>;
}
