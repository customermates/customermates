import { z } from "zod";

import { resolveRequestOrigin } from "@/core/config/environment";
import { env } from "@/env";

export const callbackUrlSchema = z
  .string()
  .min(1)
  .max(2048)
  .superRefine((value, ctx) => {
    try {
      const url = new URL(value, env.BASE_URL);
      if (resolveRequestOrigin(url.toString(), env.AUTH_ALLOWED_HOSTS, env.BASE_URL) !== url.origin)
        ctx.addIssue({ code: "custom", message: "Invalid input" });
    } catch {
      ctx.addIssue({ code: "custom", message: "Invalid input" });
    }
  });
