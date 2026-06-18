import { z } from "zod";

import { env } from "@/env";

export const callbackUrlSchema = z
  .string()
  .min(1)
  .max(2048)
  .superRefine((value, ctx) => {
    try {
      if (new URL(value, env.BASE_URL).origin !== new URL(env.BASE_URL).origin)
        ctx.addIssue({ code: "custom", message: "Invalid input" });
    } catch {
      ctx.addIssue({ code: "custom", message: "Invalid input" });
    }
  });
