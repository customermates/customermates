"use server";

import type { AcceptLegalDocumentsData } from "@/features/legal/accept-legal-documents.interactor";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { getAcceptLegalDocumentsInteractor } from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function acceptLegalDocumentsAction(data: AcceptLegalDocumentsData) {
  const result = await serializeResult(getAcceptLegalDocumentsInteractor().invoke(data));
  if (result.ok) {
    refresh();
    redirect("/");
  }
  return result;
}
