"use client";

import { useEffect, useRef, useState } from "react";

type ActivityGroupInput = {
  hasRunning: boolean;
  hasError: boolean;
  isWorking: boolean;
  startedAt?: Date;
};

export function useActivityGroupState({ hasRunning, hasError, isWorking, startedAt }: ActivityGroupInput) {
  const wasRunning = useRef(hasRunning);
  const hasEverRun = useRef(hasRunning);
  const runStartedAt = useRef<number | null>(null);
  const [open, setOpen] = useState(hasRunning);
  const [elapsedSeconds, setElapsedSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (hasRunning || hasError) setOpen(true);
    else if (hasEverRun.current && !isWorking) setOpen(false);

    if (hasRunning) {
      hasEverRun.current = true;
      runStartedAt.current ??= startedAt?.getTime() ?? Date.now();
    }

    if (!hasRunning && wasRunning.current && runStartedAt.current !== null)
      setElapsedSeconds(Math.max(1, Math.round((Date.now() - runStartedAt.current) / 1000)));

    wasRunning.current = hasRunning;
  }, [hasError, hasRunning, isWorking, startedAt]);

  return { open, setOpen, elapsedSeconds };
}
