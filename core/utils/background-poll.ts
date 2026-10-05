type BackgroundPollOptions = {
  refresh: () => Promise<unknown>;
  onError: (error: unknown) => void;
  intervalMs: number;
  immediate?: boolean;
  repeat?: boolean;
};

const INTERACTION_EVENTS = ["pointerdown", "keydown"] as const;

export function startBackgroundPoll({
  refresh,
  onError,
  intervalMs,
  immediate = false,
  repeat = true,
}: BackgroundPollOptions): () => void {
  let stopped = false;
  let pending = false;
  let leaving = false;
  const run = async () => {
    if (stopped || leaving || pending || document.visibilityState !== "visible") return;
    pending = true;
    try {
      await refresh();
    } finally {
      pending = false;
    }
  };
  const schedule = () => {
    void run().catch((error) => {
      if (!stopped && !leaving) onError(error);
    });
  };
  const leave = () => {
    leaving = true;
  };
  const resume = () => {
    leaving = false;
    schedule();
  };
  const resumeAfterInteraction = () => {
    if (leaving) resume();
  };
  const resumeAfterRestore = (event: PageTransitionEvent) => {
    if (event.persisted) resume();
  };
  const resumeWhenVisible = () => {
    if (document.visibilityState === "visible") resume();
  };
  if (immediate) schedule();
  if (!repeat) {
    return () => {
      stopped = true;
    };
  }
  const timer = window.setInterval(schedule, intervalMs);
  document.addEventListener("visibilitychange", resumeWhenVisible);
  window.addEventListener("beforeunload", leave);
  window.addEventListener("pagehide", leave);
  window.addEventListener("pageshow", resumeAfterRestore);
  window.addEventListener("focus", resume);
  for (const event of INTERACTION_EVENTS) window.addEventListener(event, resumeAfterInteraction, true);
  return () => {
    stopped = true;
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", resumeWhenVisible);
    window.removeEventListener("beforeunload", leave);
    window.removeEventListener("pagehide", leave);
    window.removeEventListener("pageshow", resumeAfterRestore);
    window.removeEventListener("focus", resume);
    for (const event of INTERACTION_EVENTS) window.removeEventListener(event, resumeAfterInteraction, true);
  };
}
