import type { DataViewChipDto, DataViewState } from "./data-view-state.schema";

export type SurfaceViewState = {
  activeViewKey: string | null;
  views: DataViewChipDto[];
  overrides: Map<string, DataViewState>;
};

export abstract class DataViewStateRepo {
  abstract loadSurfaceState(surfaceKey: string): Promise<SurfaceViewState>;
}
