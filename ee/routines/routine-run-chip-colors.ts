import type { ChipColor } from "@/constants/chip-colors";

import { RoutineRunStatus } from "@/generated/prisma";

export const ROUTINE_RUN_STATUS_CHIP_COLOR: Record<RoutineRunStatus, ChipColor> = {
  [RoutineRunStatus.queued]: "secondary",
  [RoutineRunStatus.running]: "info",
  [RoutineRunStatus.succeeded]: "success",
  [RoutineRunStatus.partial]: "warning",
  [RoutineRunStatus.failed]: "destructive",
  [RoutineRunStatus.skipped]: "secondary",
  [RoutineRunStatus.blocked]: "destructive",
};
