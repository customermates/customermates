export type ForecastingRequestStatus = "uninitialized" | "loading" | "ready" | "error";

export type ForecastingState = "loading" | "error" | "empty" | "content";

type ForecastingStateArgs = {
  status: ForecastingRequestStatus;
  columnId: string | null;
  hasStageValueSums: boolean;
};

export function resolveForecastingState({
  status,
  columnId,
  hasStageValueSums,
}: ForecastingStateArgs): ForecastingState {
  if (status === "error") return "error";
  if (status === "uninitialized" || status === "loading") return "loading";
  if (!columnId) return "empty";

  return hasStageValueSums ? "content" : "loading";
}
