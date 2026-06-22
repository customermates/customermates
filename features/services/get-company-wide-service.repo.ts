import type { ServiceDto } from "./service.schema";

export abstract class GetCompanyWideServiceRepo {
  abstract getOrThrowCompanyWide(id: string): Promise<ServiceDto>;
  abstract getManyOrThrowCompanyWide(ids: string[]): Promise<ServiceDto[]>;
}
