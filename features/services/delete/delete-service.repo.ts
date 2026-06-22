import type { ServiceDto } from "../service.schema";

export abstract class DeleteServiceRepo {
  abstract getOrThrowCompanyWide(id: string): Promise<ServiceDto>;
  abstract getManyOrThrowCompanyWide(ids: string[]): Promise<ServiceDto[]>;
  abstract deleteServiceOrThrow(id: string): Promise<ServiceDto>;
}
