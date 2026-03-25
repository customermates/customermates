import type { ServiceDto } from "./service.schema";

export abstract class GetUnscopedServiceRepo {
  abstract getOrThrowUnscoped(id: string): Promise<ServiceDto>;
  abstract getManyOrThrowUnscoped(ids: string[]): Promise<ServiceDto[]>;
}
