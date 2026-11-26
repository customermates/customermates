import "server-only";

import { checkBotId } from "botid/server";
import { getTranslations } from "next-intl/server";

import * as ErrorReporter from "@/core/observability/server";
import { serializeActionFailure } from "@/core/utils/action-result";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { createZodError } from "@/core/validation/validation.utils";
import { env } from "@/env";

export type BotCheckOutcome = { ok: true } | { ok: false; error: CustomErrorCode.botDetected };

export function botCheckEnabled(): boolean {
  return env.APP_MODE === "cloud" && env.VERCEL_ENV !== undefined && env.NODE_ENV === "production";
}

export async function checkForBot(): Promise<BotCheckOutcome> {
  if (!botCheckEnabled()) return { ok: true };

  try {
    const verdict = await checkBotId();
    return verdict.isBot ? { ok: false, error: CustomErrorCode.botDetected } : { ok: true };
  } catch (error) {
    ErrorReporter.captureException(error);
    return { ok: true };
  }
}

export async function refuseBots(): Promise<ReturnType<typeof serializeActionFailure> | null> {
  const outcome = await checkForBot();
  if (outcome.ok) return null;

  const t = await getTranslations();
  return serializeActionFailure(createZodError(t("Common.errors.botDetected"), [], { error: outcome.error }));
}
