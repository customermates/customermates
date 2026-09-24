import { SURFACE } from "@/core/data-view/data-view-keys";
import { ViewKeySchema } from "@/core/data-view/data-view-state.schema";

type SearchParams = Record<string, string | string[] | undefined>;

export async function readViewIdParam(searchParams: Promise<SearchParams> | SearchParams) {
  const resolved = await searchParams;
  if (resolved.viewSurface !== SURFACE.entityTimeline || typeof resolved.view !== "string") return undefined;
  const parsed = ViewKeySchema.safeParse(resolved.view);
  return parsed.success ? parsed.data : undefined;
}
