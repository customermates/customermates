import type { DataViewDto, DataViewState } from "@/core/data-view/data-view-state.schema";

export abstract class UpsertDataViewRepo {
  abstract findOwnedOrNull(id: string): Promise<DataViewDto | null>;
  abstract nextPosition(surfaceKey: string): Promise<number>;
  abstract createView(args: {
    surfaceKey: string;
    name: string;
    position: number;
    state: DataViewState;
  }): Promise<DataViewDto>;
  abstract updateOwned(args: {
    id: string;
    name?: string;
    position?: number;
    state?: DataViewState;
  }): Promise<DataViewDto | null>;
}
