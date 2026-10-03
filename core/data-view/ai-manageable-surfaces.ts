import { z } from "zod";

import { RecordSurfaceKeySchema } from "./data-view-identity.schema";
import {
  DATA_VIEW_SURFACE_KEYS,
  SURFACE,
  type BuiltinDataViewSurfaceKey,
  type DataViewSurfaceKey,
  type RecordSurfaceKey,
} from "./data-view-keys";

export const OPERATOR_DATA_VIEW_SURFACE_KEYS = [
  SURFACE.operatorUsers,
  SURFACE.operatorWorkspaces,
  SURFACE.operatorAudit,
] as const satisfies readonly DataViewSurfaceKey[];

const RETIRED_RECORD_SURFACES = [
  SURFACE.contacts,
  SURFACE.organizations,
  SURFACE.deals,
  SURFACE.services,
  SURFACE.tasks,
] as const;

export type BuiltinAiManageableDataViewSurfaceKey = Exclude<
  BuiltinDataViewSurfaceKey,
  (typeof OPERATOR_DATA_VIEW_SURFACE_KEYS)[number] | (typeof RETIRED_RECORD_SURFACES)[number]
>;
export type AiManageableDataViewSurfaceKey = BuiltinAiManageableDataViewSurfaceKey | RecordSurfaceKey;

const OPERATOR_SURFACES = new Set<DataViewSurfaceKey>(OPERATOR_DATA_VIEW_SURFACE_KEYS);

export const AI_MANAGEABLE_DATA_VIEW_SURFACE_KEYS = DATA_VIEW_SURFACE_KEYS.filter(
  (surfaceKey) =>
    !OPERATOR_SURFACES.has(surfaceKey) && !RETIRED_RECORD_SURFACES.some((retired) => retired === surfaceKey),
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
