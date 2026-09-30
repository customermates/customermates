"use client";

import { RecordTriggerFields } from "@/components/records/record-trigger-fields";
import type { RoutineModalStore } from "./routine-modal.store";

export function RoutineRecordTrigger({ store }: { store: RoutineModalStore }) {
  return <RecordTriggerFields store={store} />;
}
