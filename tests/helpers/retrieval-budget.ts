const MICROCENTS_PER_USD = 100_000_000;

export class RetrievalBudget {
  private committed = 0;
  private pending = 0;
  private failure: Error | null = null;
  readonly capMicrocents: number;

  constructor(cap: string) {
    const usd = Number(cap);
    if (
      !cap.trim() ||
      !Number.isFinite(usd) ||
      usd < 0 ||
      !Number.isSafeInteger(Math.ceil(usd * MICROCENTS_PER_USD))
    )
      throw new Error(
        "Retrieval eval cap must be a finite nonnegative USD amount.",
      );
    this.capMicrocents = Math.floor(usd * MICROCENTS_PER_USD);
  }

  assertAvailable() {
    if (this.failure) throw this.failure;
  }

  reserve(maximumMicrocents: number) {
    this.assertAvailable();
    if (!Number.isSafeInteger(maximumMicrocents) || maximumMicrocents <= 0)
      throw new Error(
        "Retrieval eval requires a positive conservative provider cost bound.",
      );
    if (
      this.committed + this.pending + maximumMicrocents >
      this.capMicrocents
    ) {
      this.failure = new Error(
        "Retrieval eval budget cannot admit the next provider request.",
      );
      throw this.failure;
    }
    this.pending += maximumMicrocents;
    let settled = false;
    return (measuredMicrocents?: number) => {
      if (settled)
        throw new Error("Retrieval eval reservation already settled.");
      settled = true;
      this.pending -= maximumMicrocents;
      const actual = measuredMicrocents ?? maximumMicrocents;
      if (!Number.isSafeInteger(actual) || actual < 0) {
        this.committed += maximumMicrocents;
        this.failure = new Error(
          "Retrieval eval received an invalid provider charge.",
        );
      } else {
        this.committed += actual;
        if (actual > maximumMicrocents)
          this.failure = new Error(
            "Retrieval eval provider charge exceeded its conservative bound.",
          );
      }
      this.assertAvailable();
    };
  }

  async run<T>(
    maximumMicrocents: number,
    invoke: () => Promise<T>,
    charge: (value: T) => number | undefined,
  ): Promise<T> {
    const settle = this.reserve(maximumMicrocents);
    let value: T;
    try {
      value = await invoke();
    } catch (error) {
      settle();
      throw error;
    }
    settle(charge(value));
    return value;
  }

  get accountedMicrocents() {
    return this.committed + this.pending;
  }
}
