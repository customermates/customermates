import type { DataViewState } from "@/core/data-view/data-view-state.schema";
import { isActivitySurface } from "@/core/data-view/data-view-keys";
import { CustomErrorCode } from "@/core/validation/validation.types";

export interface DataViewPolicy {
  validate(surfaceKey: string, state?: DataViewState): Promise<CustomErrorCode | null>;
}

export function validateDataViewAccess(
  policy: DataViewPolicy | undefined,
  surfaceKey: string,
  state?: DataViewState,
): Promise<CustomErrorCode | null> {
  if (!surfaceKey.startsWith("records:") && !isActivitySurface(surfaceKey)) return Promise.resolve(null);
  return policy?.validate(surfaceKey, state) ?? Promise.resolve(CustomErrorCode.permissionDenied);
}
