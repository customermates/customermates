import { z } from "zod";
import type { RecordRef } from "./record-model.schema";

export function recordReferenceKey(ref: RecordRef): string {
  return `${ref.typeId}:${ref.recordId}`;
}

export function parseRecordReferenceKey(value: string): RecordRef | null {
  const parts = value.split(":");
  if (parts.length !== 2 || !parts.every((part) => z.uuid().safeParse(part).success)) return null;
  return { typeId: parts[0], recordId: parts[1] };
}
