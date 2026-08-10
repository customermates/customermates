import { z } from "zod";

import { resolveRequestOrigin } from "@/core/config/environment";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { env } from "@/env";

function addInvalidCallbackUrlIssue(ctx: z.RefinementCtx): void {
  ctx.addIssue({ code: "custom", params: { error: CustomErrorCode.invalidCallbackUrl } });
}

export const callbackUrlSchema = z
  .string()
  .min(1)
  .max(2048)
  .superRefine((value, ctx) => {
    try {
      const url = new URL(value, env.BASE_URL);
      if (resolveRequestOrigin(url.toString(), env.AUTH_ALLOWED_HOSTS, env.BASE_URL) !== url.origin)
        addInvalidCallbackUrlIssue(ctx);
    } catch {
      addInvalidCallbackUrlIssue(ctx);
    }
  });
