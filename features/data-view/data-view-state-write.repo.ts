import type { DataViewState } from "@/core/data-view/data-view-state.schema";

export abstract class DataViewStateWriteRepo {
  abstract updateOwnedState(args: { id: string; surfaceKey: string; state: DataViewState }): Promise<boolean>;
}
