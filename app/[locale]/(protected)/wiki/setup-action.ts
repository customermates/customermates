"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";

import { getStartWikiHomepageSetupInteractor } from "@/core/di";
import { createZodError } from "@/core/validation/validation.utils";
import type { AppLocale } from "@/i18n/locale-registry";

export async function startWikiHomepageSetupAction(data: { homepage: string; clientRequestId: string }) {
  const locale = (await getLocale()) as AppLocale;
  const invoke = (retry: boolean) =>
    getStartWikiHomepageSetupInteractor().invoke({
      ...data,
      locale,
      retry,
    });

  let result = await invoke(false);
  if (result.ok && result.data.disposition === "failed" && result.data.retryAllowed) result = await invoke(true);
  if (!result.ok) return { ok: false as const, error: z.treeifyError(result.error) };

  const accepted = ["run", "running", "completedReplay"].includes(result.data.disposition);
  if (!accepted || !result.data.conversationId) {
    const t = await getTranslations("WikiSetup");
    return {
      ok: false as const,
      error: z.treeifyError(createZodError(t("startFailed"), ["homepage"])),
    };
  }

  return {
    ok: true as const,
    data: { conversationId: result.data.conversationId },
  };
}
