import { setTimeout } from "node:timers/promises";

export async function retryMigrationTransaction<T>(transaction: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await transaction();
    } catch (error) {
      const retryable =
        error !== null &&
        typeof error === "object" &&
        "code" in error &&
        (error.code === "40001" || error.code === "40P01");
      if (!retryable || attempt >= 4) throw error;
      await setTimeout(20 * 2 ** attempt);
    }
  }
}
