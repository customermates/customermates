import type { DATA_VIEW_STATE_FIELDS } from "@/core/data-view/data-view-state.schema";

export abstract class SurfaceStateResetRepo {
  abstract resetSurfaceState(
    companyId: string,
    userId: string,
    surfaceKey: string,
    fields: Array<(typeof DATA_VIEW_STATE_FIELDS)[number]>,
  ): Promise<void>;
}
