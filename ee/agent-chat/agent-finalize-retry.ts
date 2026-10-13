import { isBusyDatabaseError } from "@/core/errors/prisma-client-error";

export async function retryAgentFinalization<T>(commit: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await commit();
    } catch (error) {
      if (!isBusyDatabaseError(error) || attempt >= 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
}
