import { z } from "zod";
import type { TaskType } from "@/generated/prisma";
import { EntityType } from "@/generated/prisma";

export const LegacySearchReferenceSchema = z.object({ type: z.enum(EntityType), id: z.uuid() }).strict();
export type LegacySearchReference = z.infer<typeof LegacySearchReferenceSchema>;
export type LegacySearchResultItem = LegacySearchReference & {
  name: string;
  pictureUrl: string | null;
  taskType?: TaskType;
};
