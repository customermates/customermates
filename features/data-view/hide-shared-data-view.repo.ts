import type { DataViewDto } from "@/core/data-view/data-view-state.schema";

export abstract class HideSharedDataViewRepo {
  abstract findSharedWithMeOrNull(id: string): Promise<DataViewDto | null>;
  abstract setSharedHidden(id: string, hidden: boolean): Promise<void>;
}
