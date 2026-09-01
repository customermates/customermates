"use client";

import type { RoutineDetailStore } from "./routine-detail.store";
import type { RoutineDto, RoutineRunDto } from "@/ee/routines/routine.schema";

import { useEffect, useRef } from "react";

export function useRoutineDetailSync(
  store: RoutineDetailStore,
  routine: RoutineDto,
  initialRuns: RoutineRunDto[],
): void {
  const appliedRuns = useRef<RoutineRunDto[] | null>(null);

  if (appliedRuns.current === null && store.routine?.id !== routine.id) {
    appliedRuns.current = initialRuns;
    store.hydrate(routine, initialRuns);
  }

  useEffect(() => {
    if (appliedRuns.current === initialRuns && store.routine?.id === routine.id) return;
    appliedRuns.current = initialRuns;
    store.hydrate(routine, initialRuns);
  }, [store, routine, initialRuns]);

  const selectedRunId = store.selectedRunId;
  useEffect(() => {
    if (selectedRunId) void store.loadTranscript(selectedRunId);
  }, [store, selectedRunId]);
}
