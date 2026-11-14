import { currentAutomationChain } from "@/features/automation-rules/automation-context";
import type { TenantUser } from "@/features/user/user.schema";
import type { EventVia } from "@/features/event/event-via";
import type { RecordEventPayload, RecordOperationCause } from "./record-event.schema";

export function recordCauseBy(user: Pick<TenantUser, "via">, cause: RecordOperationCause): RecordOperationCause {
  const ruleChain = currentAutomationChain();
  const caused = ruleChain ? { ...cause, ruleChain } : cause;
  return user.via ? { ...caused, via: user.via } : caused;
}

export function splitRecordCause(cause: RecordOperationCause): {
  cause: RecordEventPayload["cause"];
  via: EventVia | null;
} {
  const { via, ...stored } = cause;
  return { cause: stored, via: via ?? null };
}
