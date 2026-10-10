import type { GroupableFieldSpec } from "./groupable-field";
import type { DateBucket } from "./grouping.schema";

export type GroupScope = {
  spec: GroupableFieldSpec;
  key: string;
  bucket?: DateBucket;
  now?: string;
};
