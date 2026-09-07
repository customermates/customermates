import type { ChipColor } from "@/constants/chip-colors";
import type { Data } from "@/core/validation/validation.utils";
import type { GroupValueSums } from "@/core/base/base-get.schema";
import type { GroupingKind } from "./groupable-field";

import { z } from "zod";

export const DATE_BUCKETS = ["day", "week", "month"] as const;
export const DateBucketSchema = z.enum(DATE_BUCKETS);
export type DateBucket = Data<typeof DateBucketSchema>;
export const DEFAULT_DATE_BUCKET: DateBucket = "month";

export const GroupingSchema = z.object({
  field: z.string().min(1).max(200),
  bucket: DateBucketSchema.optional(),
});
export type Grouping = Data<typeof GroupingSchema>;

export const NO_VALUE_GROUP_KEY = "__empty__";
export const GROUP_PAGE_SIZE_DEFAULT = 10;
export const GROUP_PAGE_SIZE_MAX = 500;
export const MAX_AXIS_GROUPS = 50;
export const MAX_MATERIALISED_GROUPS = 25;

export const GroupPageRequestSchema = z.object({
  perGroup: z.number().int().min(1).max(GROUP_PAGE_SIZE_MAX).optional(),
  overrides: z.record(z.string(), z.number().int().min(1).max(GROUP_PAGE_SIZE_MAX)).optional(),
  collapsed: z.array(z.string().max(200)).max(MAX_AXIS_GROUPS).optional(),
  only: z.string().max(200).optional(),
  includeValueSums: z.boolean().optional(),
});
export type GroupPageRequest = Data<typeof GroupPageRequestSchema>;

export type GroupLabelKind = "value" | "noValue" | "unavailable";

export type DataViewGroup = {
  key: string;
  count: number;
  labelKind: GroupLabelKind;
  label?: string;
  labelKey?: string;
  color?: ChipColor;
  weight?: number;
  avatarUrl?: string | null;
  bucketStart?: string;
  bucketRole?: "window" | "earlier" | "later";
  isNoValue: boolean;
  materialised: boolean;
  itemIds: string[];
  hasMore: boolean;
  valueSums?: GroupValueSums;
};

export type GroupingResult = {
  grouping: Grouping;
  kind: GroupingKind;
  supportsDragWriteBack: boolean;
  columnId?: string;
  groups: DataViewGroup[];
  total: number;
  membershipTotal?: number;
  overflow?: { shown: number };
  partial?: boolean;
};

export function groupingForField(field: string | null | undefined): Grouping | null | undefined {
  if (field === undefined) return undefined;

  return field ? { field } : null;
}

export function encodeGroupingToken(grouping: Grouping): string {
  return grouping.bucket ? `${grouping.field}:${grouping.bucket}` : grouping.field;
}

export function decodeGroupingToken(token: string | null | undefined): Grouping | undefined {
  if (!token) return undefined;

  const separator = token.indexOf(":");
  const head = separator === -1 ? token : token.slice(0, separator);
  const tail = separator === -1 ? undefined : token.slice(separator + 1);
  const bucket = DateBucketSchema.safeParse(tail);
  const parsed = GroupingSchema.safeParse(bucket.success ? { field: head, bucket: bucket.data } : { field: token });

  return parsed.success ? parsed.data : undefined;
}

export function sameGrouping(left: Grouping | null | undefined, right: Grouping | null | undefined): boolean {
  if (!left || !right) return !left && !right;

  return left.field === right.field && left.bucket === right.bucket;
}
