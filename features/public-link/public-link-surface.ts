import { isRecordDataViewSurface } from "@/core/data-view/ai-manageable-surfaces";
import { SURFACE } from "@/core/data-view/data-view-keys";

export function isPublishableSurface(surfaceKey: string): boolean {
  return surfaceKey === SURFACE.dashboard || isRecordDataViewSurface(surfaceKey);
}
