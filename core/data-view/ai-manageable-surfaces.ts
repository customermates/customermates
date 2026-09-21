import { z } from "zod";

import { DATA_VIEW_SURFACE_KEYS, SURFACE, type DataViewSurfaceKey } from "./data-view-keys";

export const OPERATOR_DATA_VIEW_SURFACE_KEYS = [
  SURFACE.operatorUsers,
  SURFACE.operatorWorkspaces,
  SURFACE.operatorAudit,
] as const satisfies readonly DataViewSurfaceKey[];

export type AiManageableDataViewSurfaceKey = Exclude<
  DataViewSurfaceKey,
  (typeof OPERATOR_DATA_VIEW_SURFACE_KEYS)[number]
>;

const OPERATOR_SURFACES = new Set<DataViewSurfaceKey>(OPERATOR_DATA_VIEW_SURFACE_KEYS);

export const AI_MANAGEABLE_DATA_VIEW_SURFACE_KEYS = DATA_VIEW_SURFACE_KEYS.filter(
  (surfaceKey) => !OPERATOR_SURFACES.has(surfaceKey),
) as readonly AiManageableDataViewSurfaceKey[];

export const AiManageableDataViewSurfaceKeySchema = z.enum(AI_MANAGEABLE_DATA_VIEW_SURFACE_KEYS);

const AI_MANAGEABLE_SURFACES = new Set<DataViewSurfaceKey>(AI_MANAGEABLE_DATA_VIEW_SURFACE_KEYS);

export function isAiManageableDataViewSurface(
  surfaceKey: DataViewSurfaceKey,
): surfaceKey is AiManageableDataViewSurfaceKey {
  return AI_MANAGEABLE_SURFACES.has(surfaceKey);
}
