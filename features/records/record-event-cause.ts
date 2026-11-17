import { currentCausation } from "@/core/decorators/causation-context";
import type { TenantUser } from "@/features/user/user.schema";
import type { EventVia } from "@/features/event/event-via";
import type { RecordEventPayload, RecordOperationCause } from "./record-event.schema";

import { storedEventVia } from "@/features/event/event-via";

const OUTSIDE_VIA_KINDS: readonly EventVia["kind"][] = ["form", "incomingWebhook"];

export function isOutsideRecordWrite(via: unknown): boolean {
  const stored = storedEventVia(via);
  return stored !== null && OUTSIDE_VIA_KINDS.includes(stored.kind);
}

export function recordCauseBy(user: Pick<TenantUser, "via">, cause: RecordOperationCause): RecordOperationCause {
  const { routineDepth, ruleChain } = currentCausation() ?? {};
  const inherited: Partial<RecordOperationCause> = {};
  if (routineDepth !== undefined) inherited.routineDepth = routineDepth;
  if (ruleChain?.length) inherited.ruleChain = [...ruleChain];
  const caused = Object.keys(inherited).length ? { ...inherited, ...cause } : cause;
  return user.via ? { ...caused, via: user.via } : caused;
}

export function splitRecordCause(cause: RecordOperationCause): {
  cause: RecordEventPayload["cause"];
  via: EventVia | null;
} {
  const { via, ...stored } = cause;
  return { cause: stored, via: via ?? null };
}
