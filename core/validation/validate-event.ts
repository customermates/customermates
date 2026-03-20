import type { z } from "zod";

import { DomainEvent } from "@/features/event/domain-events";
import { CustomErrorCode } from "@/core/validation/validation.types";

export function validateEvent(value: string | string[], ctx: z.RefinementCtx, fieldPath: (string | number)[]) {
  const validEvents = Object.values(DomainEvent);
  const events = Array.isArray(value) ? value : [value];
  for (let i = 0; i < events.length; i++) {
    if (!validEvents.includes(events[i] as DomainEvent)) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.invalidFilterField },
        path: Array.isArray(value) ? [...fieldPath, i] : fieldPath,
      });
    }
  }
}
