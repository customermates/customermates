"use server";

import type { SubmitPublicFormInput } from "@/features/public-form/public-form.schema";

import { getSubmitPublicFormInteractor } from "@/core/di";
import { visitorKey } from "@/core/network/visitor-key";

export async function submitPublicFormAction(input: SubmitPublicFormInput) {
  return getSubmitPublicFormInteractor().invoke({ ...input, visitor: await visitorKey() });
}
