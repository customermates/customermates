import { type ServiceDto } from "../service.schema";

export abstract class DeleteServiceRepo {
  abstract deleteServiceOrThrow(id: string): Promise<ServiceDto>;
}
