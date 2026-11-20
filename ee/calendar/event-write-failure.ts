import { fail } from "@/core/validation/interactor-failure-server";
import { retryAfterPhrase } from "@/ee/messaging/retry-after.server";

import type { EventWriteFailure } from "./calendar-event-writer";

export async function eventWriteFailure(failure: EventWriteFailure) {
  return fail(
    failure.error,
    [],
    failure.retryAfterSeconds !== undefined ? { retryAfter: await retryAfterPhrase(failure.retryAfterSeconds) } : {},
  );
}
