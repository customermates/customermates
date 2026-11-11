import type { TenantUser } from "@/features/user/user.schema";
import type { EventVia } from "@/features/event/event-via";
import type { RecordEventPayload, RecordOperationCause } from "./record-event.schema";

export function recordCauseBy(user: Pick<TenantUser, "via">, cause: RecordOperationCause): RecordOperationCause {
  return user.via ? { ...cause, via: user.via } : cause;
}

export function splitRecordCause(cause: RecordOperationCause): {
  cause: RecordEventPayload["cause"];
  via: EventVia | null;
} {
  const { via, ...stored } = cause;
  return { cause: stored, via: via ?? null };
}
