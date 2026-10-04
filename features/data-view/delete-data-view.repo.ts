import type { DataViewDto } from "@/core/data-view/data-view-state.schema";

export abstract class DeleteDataViewRepo {
  abstract findOwnedOrNull(id: string): Promise<DataViewDto | null>;
  abstract deleteOwned(id: string): Promise<boolean>;
}
