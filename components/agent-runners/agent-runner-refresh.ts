export const AGENT_RUNNER_REFRESH_MS = 30_000;

export function startAgentRunnerRefresh(
  refresh: () => unknown,
  isVisible: () => boolean,
  intervalMs: number = AGENT_RUNNER_REFRESH_MS,
): () => void {
  const timer = setInterval(() => {
    if (isVisible()) void refresh();
  }, intervalMs);
  return () => clearInterval(timer);
}
