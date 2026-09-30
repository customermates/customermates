import { z } from "zod";

import {
  DATA_VIEW_SURFACE_KEYS,
  SURFACE,
  type DataViewSurfaceKey,
  type BuiltinDataViewSurfaceKey,
  type RecordSurfaceKey,
} from "./data-view-keys";
import { RecordSurfaceKeySchema } from "./data-view-identity.schema";

export const OPERATOR_DATA_VIEW_SURFACE_KEYS = [
  SURFACE.operatorUsers,
  SURFACE.operatorWorkspaces,
  SURFACE.operatorAudit,
] as const satisfies readonly DataViewSurfaceKey[];

export type BuiltinAiManageableDataViewSurfaceKey = Exclude<
  BuiltinDataViewSurfaceKey,
  (typeof OPERATOR_DATA_VIEW_SURFACE_KEYS)[number]
>;
export type AiManageableDataViewSurfaceKey = BuiltinAiManageableDataViewSurfaceKey | RecordSurfaceKey;

const OPERATOR_SURFACES = new Set<DataViewSurfaceKey>(OPERATOR_DATA_VIEW_SURFACE_KEYS);

export const AI_MANAGEABLE_DATA_VIEW_SURFACE_KEYS = DATA_VIEW_SURFACE_KEYS.filter(
  (surfaceKey) => !OPERATOR_SURFACES.has(surfaceKey),
) as readonly BuiltinAiManageableDataViewSurfaceKey[];

export const AiManageableDataViewSurfaceKeySchema = z.union([
  z.enum(AI_MANAGEABLE_DATA_VIEW_SURFACE_KEYS),
  RecordSurfaceKeySchema,
]);

export function isRecordDataViewSurface(surfaceKey: string): surfaceKey is RecordSurfaceKey {
  return RecordSurfaceKeySchema.safeParse(surfaceKey).success;
}

const AI_MANAGEABLE_SURFACES = new Set<DataViewSurfaceKey>(AI_MANAGEABLE_DATA_VIEW_SURFACE_KEYS);

export function isAiManageableDataViewSurface(
  surfaceKey: DataViewSurfaceKey,
): surfaceKey is AiManageableDataViewSurfaceKey {
  return AI_MANAGEABLE_SURFACES.has(surfaceKey) || isRecordDataViewSurface(surfaceKey);
}
