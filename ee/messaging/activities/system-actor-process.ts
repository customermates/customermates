import type { SystemActorProcess } from "./activities.schema";

import { MESSAGING_SYSTEM_ACTOR, RECORD_SYSTEM_ACTOR } from "@/features/records/record-system-actor";

export function systemActorProcess(actorId: string | null): SystemActorProcess {
  if (actorId === MESSAGING_SYSTEM_ACTOR) return "messaging";
  if (actorId === RECORD_SYSTEM_ACTOR) return "trash";
  return "other";
}
