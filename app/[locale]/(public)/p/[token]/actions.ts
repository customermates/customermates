"use server";

import type { PublicListRecordsInput, PublicWidgetRecordsInput } from "@/features/public-link/public-link.schema";

import { getReadPublicListRecordsInteractor, getReadPublicWidgetRecordsInteractor } from "@/core/di";

import { visitorKey } from "./visitor-key";

export async function readPublicWidgetRecordsAction(input: PublicWidgetRecordsInput) {
  return getReadPublicWidgetRecordsInteractor().invoke({ ...input, visitor: await visitorKey() });
}

export async function readPublicListRecordsAction(input: PublicListRecordsInput) {
  return getReadPublicListRecordsInteractor().invoke({ ...input, visitor: await visitorKey() });
}
