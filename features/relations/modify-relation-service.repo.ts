import type { ServiceDto } from "@/features/services/service.schema";
import type { ReadableIds } from "./modify-entity-relation.interactor";

export abstract class ModifyRelationServiceRepo {
  abstract getOrThrowCompanyWide(id: string): Promise<ServiceDto>;
  abstract findIds(ids: Set<string>): Promise<ReadableIds>;
}
