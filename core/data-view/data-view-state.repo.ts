import type { DataViewChipDto, DataViewState } from "./data-view-state.schema";

export type SurfaceViewState = {
  activeViewKey: string | null;
  views: DataViewChipDto[];
  allState: DataViewState;
};

export abstract class DataViewStateRepo {
  abstract loadSurfaceState(surfaceKey: string): Promise<SurfaceViewState>;
}
