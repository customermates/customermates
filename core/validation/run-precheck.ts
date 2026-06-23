import type { z } from "zod";

import type { Validated } from "./validation.utils";

import { z as zod } from "zod";

import { configureZodLocale } from "./zod-error-map-server";

export type PrecheckFn<T> = (data: T, ctx: z.RefinementCtx) => void | Promise<void>;

export async function runPrecheck<T>(data: T, check: PrecheckFn<T>): Validated<T> {
  await configureZodLocale();

  const schema = zod.any().superRefine((value, ctx) => check(value as T, ctx));
  const result = await schema.safeParseAsync(data);

  if (!result.success) return { ok: false, error: result.error };

  return { ok: true, data };
}
