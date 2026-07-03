import { z } from "zod";

import { IGNORED_CHANGE_KEYS } from "@/core/utils/calculate-changes";

export function changesSchema(dtoShape: z.ZodRawShape) {
  const changeable = Object.entries(dtoShape).filter(([key]) => key !== "id" && !IGNORED_CHANGE_KEYS.has(key));

  return z.object(
    Object.fromEntries(
      changeable.map(([key, field]) => [key, z.object({ previous: field, current: field }).optional()]),
    ),
  );
}
