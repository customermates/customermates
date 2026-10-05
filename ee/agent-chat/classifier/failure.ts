export type ClassifierFailure = "timeout" | "rateLimited" | "unavailable" | "rejected" | "invalidAnswers" | "network";

export class ClassifierRequestError extends Error {
  constructor(
    readonly failure: ClassifierFailure,
    readonly costMicrocents: number | null = null,
  ) {
    super(`the classifier request failed: ${failure}`);
  }
}

export function classifierFailureOf(error: unknown): ClassifierFailure {
  if (error instanceof ClassifierRequestError) return error.failure;
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return "timeout";
  return "network";
}

export function httpClassifierFailure(status: number): ClassifierFailure {
  return status === 429 ? "rateLimited" : status === 408 ? "timeout" : status >= 500 ? "unavailable" : "rejected";
}
