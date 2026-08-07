"use server";

import type { AcceptLegalDocumentsData } from "@/features/legal/accept-legal-documents.interactor";

import { redirect, RedirectType } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { getAcceptLegalDocumentsInteractor } from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function acceptLegalDocumentsAction(data: AcceptLegalDocumentsData) {
  const locale = (await getLocale()) === "de" ? "de" : "en";
  const result = await serializeResult(getAcceptLegalDocumentsInteractor().invoke({ ...data, locale }));
  if (result.ok) {
    revalidatePath("/", "layout");
    redirect("/", RedirectType.replace);
  }
  return result;
}
