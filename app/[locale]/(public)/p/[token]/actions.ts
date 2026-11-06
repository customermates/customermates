"use server";

import type { PublicWidgetRecordsInput } from "@/features/public-link/public-link.schema";

import { getReadPublicWidgetRecordsInteractor } from "@/core/di";

import { visitorKey } from "./visitor-key";

export async function readPublicWidgetRecordsAction(input: PublicWidgetRecordsInput) {
  return getReadPublicWidgetRecordsInteractor().invoke({ ...input, visitor: await visitorKey() });
}
