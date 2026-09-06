import { z } from "zod";

import type { Data } from "@/core/validation/validation.utils";

import { RoutineRunDtoSchema } from "./routine.schema";

export const ROUTINE_RUN_PAGE_SIZE = 25;

export const RoutineRunPageSchema = z.object({
  runs: z.array(RoutineRunDtoSchema),
  nextCursor: z.string().nullable(),
});

export type RoutineRunPage = Data<typeof RoutineRunPageSchema>;
