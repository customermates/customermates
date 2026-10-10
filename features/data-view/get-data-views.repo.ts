import type { DataViewDto } from "@/core/data-view/data-view-state.schema";

export abstract class GetDataViewsRepo {
  abstract listDataViews(surfaceKey: string): Promise<DataViewDto[]>;
}
