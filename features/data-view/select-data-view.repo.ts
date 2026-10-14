import type { DataViewDto } from "@/core/data-view/data-view-state.schema";

export abstract class SelectDataViewRepo {
  abstract findOwnedOrNull(id: string): Promise<DataViewDto | null>;
}
