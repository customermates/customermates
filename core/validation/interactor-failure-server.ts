import { getTranslations } from "next-intl/server";

import type { CustomErrorCode } from "./validation.types";
import { createZodError, type InteractorFailure } from "./validation.utils";

export async function createInteractorFailure(
  code: CustomErrorCode,
  path: Array<string | number> = [],
  params: Record<string, unknown> = {},
): Promise<InteractorFailure> {
  const t = await getTranslations("Common.errors");
  const message = t.raw(code) as string;
  return { ok: false, error: createZodError(message, path, { ...params, error: code }) };
}
